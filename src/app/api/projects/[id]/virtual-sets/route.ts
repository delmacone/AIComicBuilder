import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { virtualSets } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sets = await db.select().from(virtualSets).where(eq(virtualSets.projectId, id));
  return NextResponse.json({ sets });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json() as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Set name is required" }, { status: 400 });
  const now = new Date();
  const [created] = await db.insert(virtualSets).values({
    id: randomUUID(),
    projectId: id,
    name,
    description: typeof body.description === "string" ? body.description : "",
    location: typeof body.location === "string" ? body.location : "",
    timeOfDay: typeof body.timeOfDay === "string" ? body.timeOfDay : "",
    weather: typeof body.weather === "string" ? body.weather : "",
    lighting: typeof body.lighting === "string" ? body.lighting : "",
    visualStylePreset: typeof body.visualStylePreset === "string" ? body.visualStylePreset : "",
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json({ set: created }, { status: 201 });
}
