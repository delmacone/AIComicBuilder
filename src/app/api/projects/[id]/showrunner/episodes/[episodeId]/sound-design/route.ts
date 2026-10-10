import { NextResponse } from "next/server";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts,scenes,shots } from "@/lib/db/schema";

/** Proposes sound design; no music licensing or paid generation occurs. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 if(!approved)return NextResponse.json({error:"Approve the screenplay before sound design"},{status:409});
 const sceneRows=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 let cursor=0;
 const cues=[];
 for(const scene of sceneRows){
  const ordered=shotRows.filter(s=>s.sceneId===scene.id).sort((a,b)=>a.sequence-b.sequence);
  const start=cursor;for(const shot of ordered)cursor+=shot.duration||10;
  if(!ordered.length)continue;
  let context:{summary?:string;location?:string}={};
  try{const value:unknown=JSON.parse(scene.description||"{}");if(value&&typeof value==="object"&&!Array.isArray(value))context=value as typeof context}catch{}
  cues.push({sceneId:scene.id,sceneTitle:scene.title,startSeconds:start,endSeconds:cursor,location:context.location||null,ambience:{description:context.location?"Location ambience for "+context.location:"Scene location ambience to be selected",status:"needs_editor_approval",volume:0.25},music:{description:"Select licensed or original score for this scene",status:"needs_editor_approval",volume:0.18,duckUnderDialogue:true},sfx:{description:"Review shot actions for motivated sound effects",status:"needs_editor_approval"},notes:"All assets require review and approved rights before final mixing"});
 }
 return NextResponse.json({episodeId,totalPlannedSeconds:cursor,scenes:cues,paidGenerationStarted:false,musicLicensed:false,readyForFinalMix:false});
}
