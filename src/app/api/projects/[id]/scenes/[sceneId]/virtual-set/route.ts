import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, virtualSets } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as { virtualSetId?: string | null };
  if (body.virtualSetId) {
    const [set] = await db.select().from(virtualSets).where(and(eq(virtualSets.id, body.virtualSetId), eq(virtualSets.projectId, id)));
    if (!set) return NextResponse.json({ error: "Virtual Set not found" }, { status: 404 });
  }
  const [scene] = await db.update(scenes).set({ virtualSetId: body.virtualSetId || null }).where(and(eq(scenes.id, sceneId), eq(scenes.projectId, id))).returning();
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  return NextResponse.json({ scene });
}
