import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { virtualSets } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id, setId } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as Record<string, unknown>;
  const allowed = ["name", "description", "location", "timeOfDay", "weather", "lighting", "visualStylePreset"] as const;
  const patch: Record<string, string | Date> = { updatedAt: new Date() };
  for (const key of allowed) if (typeof body[key] === "string") patch[key] = body[key] as string;
  const [updated] = await db.update(virtualSets).set(patch).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, id))).returning();
  if (!updated) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  return NextResponse.json({ set: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id, setId } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [deleted] = await db.delete(virtualSets).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, id))).returning();
  if (!deleted) return NextResponse.json({ error: "Set not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
