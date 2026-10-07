import OpenAI from "openai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, characters, scenes, shots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enqueueTask } from "@/lib/task-queue";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Lioncore is not connected. Add OPENAI_API_KEY on the server." }, { status: 503 });
  }

  const body = await request.json() as { message?: string; action?: "audit_continuity" | "scene_review" | "retry_shot" | "detect_scene_events" | "apply_scene_events"; sceneId?: string; shotId?: string; confirm?: boolean; modelConfig?: unknown };
  const message = body.message?.trim() || "";
  if (!message && !body.action) return NextResponse.json({ error: "Message or action required" }, { status: 400 });

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [cast, projectScenes, projectShots] = await Promise.all([
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(scenes).where(eq(scenes.projectId, projectId)),
    db.select().from(shots).where(eq(shots.projectId, projectId)),
  ]);

  const context = {
    project: { id: project.id, title: project.title, colorPalette: project.colorPalette },
    characters: cast.map((c) => ({
      id: c.id, name: c.name, description: c.description,
      canonLockEnabled: c.canonLockEnabled === 1,
      canonLockVersion: c.canonLockVersion,
      canonVisualLock: c.canonVisualLock,
    })),
    scenes: projectScenes.map((s) => ({
      id: s.id, title: s.title, description: s.description, lighting: s.lighting,
      colorPalette: s.colorPalette, continuityState: s.continuityState,
    })),
    shots: projectShots.map((s) => ({
      id: s.id, sequence: s.sequence, prompt: s.prompt, duration: s.duration,
      sceneId: s.sceneId, continuityStatus: s.continuityStatus,
      continuityScore: s.continuityScore, continuityIssues: s.continuityIssues,
    })),
  };

  // Read-only production actions: Lioncore may inspect and report without
  // mutating canon, shots, scenes or assets.
  if (body.action === "audit_continuity") {
    const problemShots = projectShots
      .filter((s) => s.continuityStatus === "failed" || s.continuityStatus === "review_required")
      .map((s) => ({ sequence: s.sequence, status: s.continuityStatus, score: s.continuityScore, issues: s.continuityIssues }));
    return NextResponse.json({
      action: body.action,
      reply: problemShots.length
        ? `Continuity audit found ${problemShots.length} shot(s) requiring attention:\n` + problemShots.map((s) => `Shot ${s.sequence}: ${s.status} (score ${s.score ?? 0}) — ${s.issues || "review required"}`).join("\n")
        : "Continuity audit: no failed or review-required shots found.",
      results: problemShots,
    });
  }

  if (body.action === "retry_shot") {
    if (!body.confirm) {
      return NextResponse.json({ error: "Explicit confirmation is required before Lioncore regenerates production frames." }, { status: 409 });
    }
    const target = projectShots.find((s) => s.id === body.shotId);
    if (!target) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    if (target.continuityStatus === "passed") {
      return NextResponse.json({ error: "Shot already passed canon continuity. Lioncore will not replace an approved shot automatically." }, { status: 409 });
    }
    const task = await enqueueTask({
      type: "frame_generate",
      projectId,
      episodeId: target.episodeId || undefined,
      payload: { shotId: target.id, projectId, modelConfig: body.modelConfig },
    });
    return NextResponse.json({
      action: body.action,
      taskId: task.id,
      reply: `Lioncore queued Shot ${target.sequence} for controlled frame regeneration. Locked canon remains unchanged.`,
    });
  }

  if (body.action === "detect_scene_events" || body.action === "apply_scene_events") {
    const scene = projectScenes.find((item) => item.id === body.sceneId);
    if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    const sceneShots = projectShots.filter((item) => item.sceneId === scene.id).sort((a, b) => a.sequence - b.sequence);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.LIONCORE_OPENAI_MODEL || "gpt-6-luna",
      instructions: "You are Lioncore, continuity supervisor. Identify only persistent production changes later shots must remember: environment changes, moved or dropped props, character condition, wardrobe condition, weather, lighting, position, or persistent visual effects. Do not invent events. Return JSON only with an events array. Each event has type, target, change, and shotId.",
      input: JSON.stringify({ scene: { id: scene.id, title: scene.title, description: scene.description, continuityState: scene.continuityState }, shots: sceneShots.map((shot) => ({ id: shot.id, sequence: shot.sequence, prompt: shot.prompt, motionScript: shot.motionScript, videoScript: shot.videoScript })) }),
    });
    const match = response.output_text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Lioncore returned no valid event proposal" }, { status: 502 });
    const parsed = JSON.parse(match[0]) as { events?: Array<{ type?: string; target?: string; change?: string; shotId?: string }> };
    const events = (parsed.events || []).filter((event) => event.target && event.change);
    if (body.action === "detect_scene_events") return NextResponse.json({ action: body.action, events, reply: events.length ? "Lioncore found " + events.length + " persistent scene event(s). Review before applying." : "Lioncore found no persistent scene events to add." });
    if (!body.confirm) return NextResponse.json({ error: "Explicit confirmation is required before Lioncore changes Scene Memory.", events }, { status: 409 });
    let state: Record<string, unknown> = {}; try { state = JSON.parse(scene.continuityState || "{}"); } catch {}
    const existingEvents = Array.isArray(state.events) ? state.events : [];
    const persistentChanges = state.persistentChanges && typeof state.persistentChanges === "object" ? state.persistentChanges as Record<string, unknown> : {};
    for (const event of events) { existingEvents.push({ ...event, recordedAt: new Date().toISOString(), source: "lioncore" }); if (event.target) persistentChanges[event.target] = event.change; }
    state.events = existingEvents; state.persistentChanges = persistentChanges;
    await db.update(scenes).set({ continuityState: JSON.stringify(state), continuityStateVersion: scene.continuityStateVersion + 1 }).where(eq(scenes.id, scene.id));
    return NextResponse.json({ action: body.action, events, reply: "Lioncore applied " + events.length + " confirmed event(s) to Scene Memory." });
  }

  if (body.action === "scene_review") {
    const scene = projectScenes.find((s) => s.id === body.sceneId);
    if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    const sceneShots = projectShots.filter((s) => s.sceneId === scene.id);
    const state = (() => { try { return JSON.parse(scene.continuityState || "{}"); } catch { return {}; } })();
    return NextResponse.json({
      action: body.action,
      reply: `Scene: ${scene.title || "Untitled"}\nShots: ${sceneShots.length}\nLighting: ${scene.lighting || "not set"}\nColour palette: ${scene.colorPalette || "not set"}\nContinuity state: ${Object.keys(state).length ? JSON.stringify(state, null, 2) : "not set"}\nCanon gate: ${sceneShots.filter((s) => s.continuityStatus === "passed").length}/${sceneShots.length} shots passed.`,
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.LIONCORE_OPENAI_MODEL || "gpt-6-luna",
    instructions: `You are Lioncore, the production intelligence inside BlackFist Motion Studio.
Protect BlackFist Universe canon and continuity. Help with story, storyboard, animation production,
characters, costumes, scenes, shots and quality control. Never silently rewrite locked canon.
If a requested change conflicts with locked canon, clearly identify the conflict and recommend an
explicit canon revision instead. Be concise and production-focused.`,
    input: `BLACKFIST PROJECT CONTEXT:\n${JSON.stringify(context)}\n\nUSER:\n${message}`,
  });

  return NextResponse.json({ reply: response.output_text, model: process.env.LIONCORE_OPENAI_MODEL || "gpt-6-luna" });
}
