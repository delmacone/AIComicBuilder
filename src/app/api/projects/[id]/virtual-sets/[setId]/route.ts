import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { virtualSets, scenes } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id, setId } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as Record<string, unknown>;
  const allowed = ["name", "description", "location", "timeOfDay", "weather", "lighting", "visualStylePreset", "layoutState", "propsState", "damageState", "referenceImages"] as const;
  const patch: Record<string, string | number | Date> = { updatedAt: new Date() };
  if (typeof body.continuityLockEnabled === "boolean") patch.continuityLockEnabled = body.continuityLockEnabled ? 1 : 0;
  if (body.bumpLockVersion === true) patch.continuityLockVersion = 1;
  for (const key of allowed) if (typeof body[key] === "string") patch[key] = body[key] as string;
  const [updated] = await db.update(virtualSets).set(patch).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, id))).returning();
  if (!updated) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  return NextResponse.json({ set: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id, setId } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.update(scenes).set({ virtualSetId: null }).where(and(eq(scenes.projectId, id), eq(scenes.virtualSetId, setId)));
  const [deleted] = await db.delete(virtualSets).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, id))).returning();
  if (!deleted) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
