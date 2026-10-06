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

  const body = await request.json() as { message?: string; action?: "audit_continuity" | "scene_review" | "retry_shot"; sceneId?: string; shotId?: string; confirm?: boolean };
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
      payload: { shotId: target.id, projectId },
    });
    return NextResponse.json({
      action: body.action,
      taskId: task.id,
      reply: `Lioncore queued Shot ${target.sequence} for controlled frame regeneration. Locked canon remains unchanged.`,
    });
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
