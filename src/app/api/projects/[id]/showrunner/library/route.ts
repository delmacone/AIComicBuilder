import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { characters, projects } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { getUserIdFromRequest } from "@/lib/get-user-id";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownedShows = await db.select({ id: projects.id, title: projects.title }).from(projects).where(and(eq(projects.userId, userId), ne(projects.id, id)));
  const library = [];
  for (const show of ownedShows) {
    const cast = await db.select().from(characters).where(and(eq(characters.projectId, show.id), eq(characters.scope, "main")));
    for (const character of cast) library.push({ id: character.id, sourceProjectId: show.id, sourceShow: show.title, name: character.name, referenceImage: character.referenceImage, canonLockEnabled: character.canonLockEnabled, voiceLockEnabled: character.voiceLockEnabled });
  }
  return NextResponse.json({ characters: library });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { sourceCharacterId?: string } | null;
  if (typeof body?.sourceCharacterId !== "string") return NextResponse.json({ error: "sourceCharacterId required" }, { status: 400 });
  const [source] = await db.select().from(characters).innerJoin(projects, eq(characters.projectId, projects.id)).where(and(eq(characters.id, body.sourceCharacterId), eq(projects.userId, userId), ne(projects.id, id)));
  if (!source) return NextResponse.json({ error: "Character not found in your library" }, { status: 404 });
  const original = source.characters;
  const [imported] = await db.insert(characters).values({
    id: randomUUID(), projectId: id, name: original.name, description: original.description,
    visualHint: original.visualHint, referenceImage: original.referenceImage,
    referenceImageHistory: original.referenceImageHistory, scope: "main",
    performanceStyle: original.performanceStyle, elevenLabsVoiceId: original.elevenLabsVoiceId,
    voiceLockEnabled: original.voiceLockEnabled, voiceLockVersion: original.voiceLockVersion,
    heightCm: original.heightCm, bodyType: original.bodyType,
    canonVisualLock: original.canonVisualLock, canonLockEnabled: original.canonLockEnabled,
    canonLockVersion: original.canonLockVersion,
  }).returning();
  return NextResponse.json({ character: { id: imported.id, name: imported.name, referenceImage: imported.referenceImage }, sourceCharacterId: original.id, importedAsSnapshot: true }, { status: 201 });
}
