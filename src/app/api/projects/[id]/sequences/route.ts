import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { blackfistSequences, scenes, shots, projects } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function GET(request: Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params; if(!(await assertProjectOwnership(request,id))) return NextResponse.json({error:"Not found"},{status:404});
 const rows=await db.select().from(blackfistSequences).where(eq(blackfistSequences.projectId,id)).orderBy(asc(blackfistSequences.createdAt));
 return NextResponse.json(rows);
}
export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params; if(!(await assertProjectOwnership(request,id))) return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json() as {sceneId?:string;name?:string;shotIds?:string[]};
 if(!body.sceneId) return NextResponse.json({error:"Scene required"},{status:400});
 const [scene]=await db.select().from(scenes).where(and(eq(scenes.id,body.sceneId),eq(scenes.projectId,id)));
 if(!scene) return NextResponse.json({error:"Scene not found"},{status:404});
 const sceneShots=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.sceneId,scene.id))).orderBy(asc(shots.sequence));
 const requested=body.shotIds?.length ? sceneShots.filter(s=>body.shotIds!.includes(s.id)) : sceneShots.slice(0,5);
 if(requested.length<2 || requested.length>5) return NextResponse.json({error:"A BlackFist sequence requires 2 to 5 shots"},{status:400});
 const [project]=await db.select().from(projects).where(eq(projects.id,id));
 const snapshot={sceneState:scene.continuityState,sceneStateVersion:scene.continuityStateVersion,visualStylePreset:project?.visualStylePreset,visualStyleLockVersion:project?.visualStyleLockVersion};
 const plan={shots:requested.map(s=>({id:s.id,sequence:s.sequence,prompt:s.prompt,cameraDirection:s.cameraDirection,duration:s.duration,continuityStatus:s.continuityStatus}))};
 const [created]=await db.insert(blackfistSequences).values({id:randomUUID(),projectId:id,episodeId:scene.episodeId,sceneId:scene.id,name:body.name?.trim()||`${scene.title||"Scene"} Multi-Shot`,shotIds:JSON.stringify(requested.map(s=>s.id)),plan:JSON.stringify(plan),continuitySnapshot:JSON.stringify(snapshot)}).returning();
 return NextResponse.json(created,{status:201});
}
