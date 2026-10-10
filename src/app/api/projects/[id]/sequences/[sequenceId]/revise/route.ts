import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences,scenes,shots,projects,characters,blackfistCharacterStates } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id,sequenceId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [old]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id)));
 if(!old)return NextResponse.json({error:"Sequence not found"},{status:404});
 const [scene]=await db.select().from(scenes).where(and(eq(scenes.id,old.sceneId||""),eq(scenes.projectId,id)));
 const [project]=await db.select().from(projects).where(eq(projects.id,id));
 if(!scene||!project)return NextResponse.json({error:"Scene or project missing"},{status:409});
 let ids:string[];try{const p:unknown=JSON.parse(old.shotIds);if(!Array.isArray(p)||!p.every(x=>typeof x==="string"))throw Error("invalid");ids=p as string[]}catch{return NextResponse.json({error:"Invalid shot list"},{status:409})}
 const sceneShots=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.sceneId,scene.id))).orderBy(asc(shots.sequence));
 const selected=ids.map(x=>sceneShots.find(s=>s.id===x));
 if(ids.length<3||ids.length>5||selected.some(x=>!x))return NextResponse.json({error:"Shot membership changed; create a new plan"},{status:409});
 const cast=await db.select().from(characters).where(eq(characters.projectId,id));
 const states=await db.select().from(blackfistCharacterStates).where(eq(blackfistCharacterStates.projectId,id));
 const snapshot={sceneState:scene.continuityState,sceneStateVersion:scene.continuityStateVersion,visualStylePreset:project.visualStylePreset,visualStyleLockVersion:project.visualStyleLockVersion,characterStateVersions:Object.fromEntries(states.filter(x=>x.episodeId===scene.episodeId).map(x=>[x.characterId,{version:x.version}])),canonVersions:Object.fromEntries(cast.filter(x=>x.canonLockEnabled===1).map(x=>[x.id,x.canonLockVersion]))};
 let oldPlan:{direction?:unknown[]}={};try{oldPlan=JSON.parse(old.plan||"{}")}catch{}
 const plan={shots:selected.map(x=>({id:x!.id,sequence:x!.sequence,prompt:x!.prompt,cameraDirection:x!.cameraDirection,duration:x!.duration,continuityStatus:x!.continuityStatus})),direction:oldPlan.direction||[]};
 const lineage=old.revisionOfSequenceId||old.id;
 const siblings=await db.select().from(blackfistSequences).where(eq(blackfistSequences.projectId,id));
 const revisionNumber=Math.max(0,...siblings.filter(x=>x.id===lineage||x.revisionOfSequenceId===lineage).map(x=>x.revisionNumber))+1;
 const [created]=await db.insert(blackfistSequences).values({id:randomUUID(),projectId:id,episodeId:old.episodeId,sceneId:scene.id,name:old.name,engine:old.engine,shotIds:old.shotIds,plan:JSON.stringify(plan),continuitySnapshot:JSON.stringify(snapshot),revisionOfSequenceId:lineage,revisionNumber,status:"draft"}).returning();
 return NextResponse.json({sequence:created,previousSequenceId:old.id,revisionNumber},{status:201});
}
