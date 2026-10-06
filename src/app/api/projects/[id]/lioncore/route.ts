import OpenAI from "openai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, characters, scenes, shots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  const body = await request.json() as { message?: string };
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

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
