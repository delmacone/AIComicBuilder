import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackfistSequences, scenes, shots, projects, characters, blackfistCharacterStates } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sequenceId: string }> }) {
 const { id, sequenceId } = await params;
 if (!(await assertProjectOwnership(request, id))) return NextResponse.json({error:"Not found"},{status:404});
 const [seq] = await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id)));
 if (!seq) return NextResponse.json({error:"Sequence not found"},{status:404});
 if (seq.status !== "draft" || seq.providerTaskId || seq.videoUrl || seq.finalVideoUrl || seq.avStatus === "approved") return NextResponse.json({error:"Cannot refresh generated, submitted or approved production. Create a new sequence revision."},{status:409});
 const [scene] = await db.select().from(scenes).where(and(eq(scenes.id,seq.sceneId||""),eq(scenes.projectId,id)));
 const [project] = await db.select().from(projects).where(eq(projects.id,id));
 if (!scene || !project) return NextResponse.json({error:"Scene or project missing"},{status:409});
 let ids:string[];try { const parsed:unknown=JSON.parse(seq.shotIds);if(!Array.isArray(parsed)||!parsed.every(x=>typeof x==="string"))throw new Error("invalid");ids=parsed as string[]; } catch {return NextResponse.json({error:"Invalid sequence shot list"},{status:409})}
 const allShots=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.sceneId,scene.id))).orderBy(asc(shots.sequence));
 const selected=ids.map(id=>allShots.find(s=>s.id===id));
 if(selected.length<3||selected.length>5||selected.some(s=>!s))return NextResponse.json({error:"Sequence shot membership changed; create a new plan"},{status:409});
 const cast=await db.select().from(characters).where(eq(characters.projectId,id));
 const states=await db.select().from(blackfistCharacterStates).where(eq(blackfistCharacterStates.projectId,id));
 const characterStateVersions=Object.fromEntries(states.filter(s=>s.episodeId===scene.episodeId).map(s=>[s.characterId,{version:s.version}]));
 const canonVersions=Object.fromEntries(cast.filter(c=>c.canonLockEnabled===1).map(c=>[c.id,c.canonLockVersion]));
 const snapshot={characterStateVersions,canonVersions,sceneState:scene.continuityState,sceneStateVersion:scene.continuityStateVersion,visualStylePreset:project.visualStylePreset,visualStyleLockVersion:project.visualStyleLockVersion};
 let oldPlan: {direction?:unknown[]}={};try{oldPlan=JSON.parse(seq.plan||"{}")}catch{}
 const plan={shots:selected.map(s=>({id:s!.id,sequence:s!.sequence,prompt:s!.prompt,cameraDirection:s!.cameraDirection,duration:s!.duration,continuityStatus:s!.continuityStatus})),direction:oldPlan.direction||[]};
 const [updated]=await db.update(blackfistSequences).set({plan:JSON.stringify(plan),continuitySnapshot:JSON.stringify(snapshot),inheritedCharacterStates:"{}",inheritedState:"{}",inheritedStateVersion:0,inheritedFromSequenceId:null,continuityAnchorUrl:null,updatedAt:new Date()}).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id),eq(blackfistSequences.status,"draft"))).returning();
 if(!updated)return NextResponse.json({error:"Sequence changed during refresh"},{status:409});
 return NextResponse.json({sequenceId,refreshed:true,continuitySnapshot:snapshot});
}
