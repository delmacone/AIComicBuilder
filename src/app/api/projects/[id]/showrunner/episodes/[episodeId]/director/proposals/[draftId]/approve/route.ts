import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistDirectorDrafts, shots } from "@/lib/db/schema";

type Proposal={shotId:string;sceneId:string;cameraDirection:string;blockingNotes:string;transitionIn:string;transitionOut:string;reason:string};
const allowedTransitions=new Set(["cut","fade","dissolve","wipe","match cut"]);
/** Apply explicitly selected editorial directions; never start paid generation. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string;draftId:string}>}){
 const {id,episodeId,draftId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean;shotIds?:unknown}|null;
 if(body?.confirm!==true||!Array.isArray(body.shotIds)||!body.shotIds.length||body.shotIds.length>300||body.shotIds.some(x=>typeof x!=="string"))
  return NextResponse.json({error:"Explicit confirmation and selected shot IDs required"},{status:400});
 const selected=new Set(body.shotIds as string[]);
 if(selected.size!==body.shotIds.length)return NextResponse.json({error:"Duplicate shot IDs"},{status:400});
 try{
  const result=await db.transaction(async tx=>{
   const [draft]=await tx.select().from(blackfistDirectorDrafts).where(and(eq(blackfistDirectorDrafts.id,draftId),eq(blackfistDirectorDrafts.projectId,id),eq(blackfistDirectorDrafts.episodeId,episodeId))).limit(1);
   if(!draft)return {error:"Director draft not found",status:404};
   if(draft.status!=="draft_review_required")return {error:"Director draft already processed",status:409};
   let proposals:Proposal[];
   try{proposals=JSON.parse(draft.proposalsJson) as Proposal[]}catch{return {error:"Invalid saved director draft",status:422}}
   if(!Array.isArray(proposals)||proposals.length>300)return {error:"Invalid proposal list",status:422};
   const chosen=proposals.filter(p=>selected.has(p.shotId));
   if(chosen.length!==selected.size)return {error:"Selected shots not present in draft",status:409};
   const rows=await tx.select({id:shots.id,sceneId:shots.sceneId,status:shots.status}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
   const byId=new Map(rows.map(s=>[s.id,s]));
   for(const p of chosen){
    const shot=byId.get(p.shotId);
    if(!shot||shot.sceneId!==p.sceneId||shot.status==="generating"||shot.status==="completed")return {error:"Shot changed or is already in production",status:409};
    if(!p.cameraDirection||p.cameraDirection.length>200||p.blockingNotes.length>2000||!allowedTransitions.has(p.transitionIn)||!allowedTransitions.has(p.transitionOut))return {error:"Invalid director proposal",status:422};
   }
   for(const p of chosen){
    await tx.update(shots).set({cameraDirection:p.cameraDirection,motionScript:p.blockingNotes,transitionIn:p.transitionIn,transitionOut:p.transitionOut,continuityStatus:"review_required"}).where(and(eq(shots.id,p.shotId),eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
   }
   await tx.update(blackfistDirectorDrafts).set({status:"applied"}).where(and(eq(blackfistDirectorDrafts.id,draftId),eq(blackfistDirectorDrafts.projectId,id),eq(blackfistDirectorDrafts.episodeId,episodeId)));
   return {applied:true,shotCount:chosen.length,remainingUnselected:proposals.length-chosen.length};
  });
  if("error" in result)return NextResponse.json({error:result.error},{status:result.status});
  return NextResponse.json({episodeId,draftId,...result,continuityReviewRequired:true,paidGenerationStarted:false});
 }catch{return NextResponse.json({error:"Unable to apply director draft; no partial changes saved"},{status:500})}
}
