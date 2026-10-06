import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { virtualSets } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id: projectId, setId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as { referenceImage?: string };
  if (!body.referenceImage) return NextResponse.json({ error: "Reference image is required" }, { status: 400 });
  const [set] = await db.select().from(virtualSets).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, projectId)));
  if (!set) return NextResponse.json({ error: "Virtual Set not found" }, { status: 404 });
  let refs: string[] = [];
  try { refs = JSON.parse(set.referenceImages || "[]"); } catch {}
  refs = refs.filter(ref => ref !== body.referenceImage);
  const [updated] = await db.update(virtualSets).set({
    referenceImages: JSON.stringify(refs),
    continuityLockVersion: (set.continuityLockVersion || 1) + 1,
    updatedAt: new Date(),
  }).where(eq(virtualSets.id, setId)).returning();
  return NextResponse.json({ set: updated });
}
