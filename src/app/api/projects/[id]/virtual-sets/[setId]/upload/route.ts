import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { virtualSets } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

const uploadDir = process.env.UPLOAD_DIR || "./uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id: projectId, setId } = await params;
  if (!(await assertProjectOwnership(request, projectId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [set] = await db.select().from(virtualSets).where(and(eq(virtualSets.id, setId), eq(virtualSets.projectId, projectId)));
  if (!set) return NextResponse.json({ error: "Virtual Set not found" }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file || !file.type.startsWith("image/")) return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Reference image must be 10MB or smaller" }, { status: 413 });

  const ext = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "png";
  const filename = `${genId()}.${ext}`;
  const dir = path.join(uploadDir, "virtual-sets", setId);
  fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, Buffer.from(await file.arrayBuffer()));

  let refs: string[] = [];
  try { refs = JSON.parse(set.referenceImages || "[]"); } catch {}
  if (!refs.includes(filepath)) refs.push(filepath);
  const [updated] = await db.update(virtualSets).set({
    referenceImages: JSON.stringify(refs),
    continuityLockVersion: (set.continuityLockVersion || 1) + 1,
    updatedAt: new Date(),
  }).where(eq(virtualSets.id, setId)).returning();
  return NextResponse.json({ set: updated, referenceImage: filepath });
}
