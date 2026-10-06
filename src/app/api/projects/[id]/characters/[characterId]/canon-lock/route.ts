import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import type { CanonVisualLock } from "@/lib/pipeline/blackfist-continuity-check";

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id: projectId, characterId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [character] = await db.select().from(characters).where(
    and(eq(characters.id, characterId), eq(characters.projectId, projectId))
  );
  if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!character.referenceImage) {
    return NextResponse.json(
      { error: "An approved character reference image is required before Canon Visual Lock can be enabled." },
      { status: 400 }
    );
  }

  const body = await request.json() as Partial<CanonVisualLock>;
  const required = {
    skinTone: required.skinTone,
    hair: required.hair,
    bodyBuild: required.bodyBuild,
    costume: required.costume,
    emblem: required.emblem,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Canon Visual Lock is incomplete. Add: ${missing.join(", ")}.`, missing },
      { status: 400 }
    );
  }
  const lock: CanonVisualLock = {
    characterName: character.name,
    skinTone: cleanString(body.skinTone),
    hair: cleanString(body.hair),
    bodyBuild: cleanString(body.bodyBuild) || cleanString(character.bodyType),
    costume: cleanString(body.costume),
    emblem: cleanString(body.emblem),
    costumeColors: Array.isArray(body.costumeColors) ? body.costumeColors.map(String).filter(Boolean) : [],
    accessories: Array.isArray(body.accessories) ? body.accessories.map(String).filter(Boolean) : [],
    powerEffects: cleanString(body.powerEffects),
    notes: cleanString(body.notes),
  };

  const nextVersion = (character.canonLockVersion || 0) + 1;
  const [updated] = await db.update(characters).set({
    canonVisualLock: JSON.stringify(lock),
    canonLockEnabled: 1,
    canonLockVersion: nextVersion,
  }).where(eq(characters.id, characterId)).returning();

  return NextResponse.json({
    characterId,
    referenceImage: character.referenceImage,
    canonLockEnabled: true,
    canonLockVersion: nextVersion,
    canonVisualLock: lock,
    character: updated,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id: projectId, characterId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [existing] = await db.select().from(characters).where(
    and(eq(characters.id, characterId), eq(characters.projectId, projectId))
  );
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(characters).set({ canonLockEnabled: 0 })
    .where(eq(characters.id, characterId));

  return NextResponse.json({
    characterId,
    canonLockEnabled: false,
    canonLockVersion: existing.canonLockVersion,
  });
}
