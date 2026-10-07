import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

type SceneState = Record<string, unknown>;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id: projectId, sceneId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [scene] = await db.select().from(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const body = await request.json() as { state?: SceneState; event?: { type?: string; target?: string; change?: string; shotId?: string } };
  let state: SceneState = {};
  try { state = JSON.parse(scene.continuityState || "{}"); } catch { return NextResponse.json({ error: "Existing scene continuity state is invalid" }, { status: 409 }); }

  if (body.state && typeof body.state === "object") state = { ...state, ...body.state };
  if (body.event) {
    const events = Array.isArray(state.events) ? state.events : [];
    state.events = [...events, { ...body.event, recordedAt: new Date().toISOString() }];
    if (body.event.target && body.event.change) {
      const persistentChanges = state.persistentChanges && typeof state.persistentChanges === "object" ? state.persistentChanges as SceneState : {};
      state.persistentChanges = { ...persistentChanges, [body.event.target]: body.event.change };
    }
  }

  const [updated] = await db.update(scenes).set({
    continuityState: JSON.stringify(state),
    continuityStateVersion: scene.continuityStateVersion + 1,
  }).where(eq(scenes.id, sceneId)).returning();
  return NextResponse.json({ scene: updated, state });
}
