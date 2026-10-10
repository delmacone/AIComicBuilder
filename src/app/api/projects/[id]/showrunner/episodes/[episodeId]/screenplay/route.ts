import OpenAI from "openai";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { characters, episodeCharacters, episodes } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

type SceneDraft = { heading: string; summary: string; location: string; dialogue: Array<{ characterId: string; line: string }>; shots: Array<{ description: string; durationSeconds: number }> };
function validateDraft(value: unknown, castIds: Set<string>): SceneDraft[] | null {
 if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
 const scenes: SceneDraft[] = [];
 for (const item of value) {
  if (!item || typeof item !== "object") return null;
  const s = item as Record<string, unknown>;
  if (typeof s.heading !== "string" || !s.heading.trim() || typeof s.summary !== "string" || typeof s.location !== "string" || !Array.isArray(s.dialogue) || !Array.isArray(s.shots) || s.shots.length > 15) return null;
  const dialogue: SceneDraft["dialogue"] = [];
  for (const d of s.dialogue) {
   if (!d || typeof d.characterId !== "string" || !castIds.has(d.characterId) || typeof d.line !== "string" || d.line.length > 1200) return null;
   dialogue.push({ characterId: d.characterId, line: d.line });
  }
  const shots: SceneDraft["shots"] = [];
  for (const x of s.shots) {
   if (!x || typeof x.description !== "string" || !Number.isFinite(x.durationSeconds) || x.durationSeconds < 1 || x.durationSeconds > 30) return null;
   shots.push({ description: x.description.slice(0,1200), durationSeconds: x.durationSeconds });
  }
  scenes.push({ heading: s.heading.slice(0,150), summary: s.summary.slice(0,3000), location: s.location.slice(0,150), dialogue, shots });
 }
 return scenes;
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
 const { id, episodeId } = await params;
 if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const [episode] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.projectId, id)));
 if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
 const body = await request.json().catch(() => null) as { idea?: string } | null;
 const idea = typeof body?.idea === "string" && body.idea.trim() ? body.idea.trim().slice(0,12000) : (episode.idea || episode.script || "").trim();
 if (!idea) return NextResponse.json({ error: "Episode story idea required" }, { status: 400 });
 const assigned = await db.select({ character: characters }).from(episodeCharacters).innerJoin(characters, eq(episodeCharacters.characterId, characters.id)).where(and(eq(episodeCharacters.episodeId, episodeId), eq(characters.projectId, id)));
 if (!assigned.length) return NextResponse.json({ error: "Assign actors before generating a screenplay" }, { status: 409 });
 if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI screenplay generation requires OPENAI_API_KEY" }, { status: 503 });
 const cast = assigned.map(({ character: c }) => ({ id: c.id, name: c.name, description: c.description, canonLockEnabled: Boolean(c.canonLockEnabled), canonVisualLock: c.canonVisualLock }));
 try {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({ model: process.env.LIONCORE_OPENAI_MODEL || "gpt-5.5", instructions: "You are the BlackFist Universe television screenplay director. Return a JSON object with a scenes array of 3 to 8 concise television scenes. Each scene has heading, summary, location, dialogue (array of {characterId,line}) and shots (array of {description,durationSeconds}). Only use provided cast character IDs in dialogue. Preserve all locked canon. This is a DRAFT for human review, not an approved production. No markdown.", input: JSON.stringify({ episode: episode.title, idea, cast, targetDurationSeconds: episode.targetDuration || 1320 }) });
  const raw = response.output_text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  const parsed = JSON.parse(raw) as { scenes?: unknown };
  const scenes = validateDraft(parsed.scenes, new Set(cast.map(c => c.id)));
  if (!scenes) return NextResponse.json({ error: "AI returned an invalid screenplay; no changes saved" }, { status: 502 });
  return NextResponse.json({ status: "draft_review_required", episodeId, cast, scenes, estimatedShotSeconds: scenes.flatMap(s => s.shots).reduce((sum, shot) => sum + shot.durationSeconds, 0), persisted: false });
 } catch { return NextResponse.json({ error: "Screenplay generation failed; no changes saved" }, { status: 502 }); }
}
