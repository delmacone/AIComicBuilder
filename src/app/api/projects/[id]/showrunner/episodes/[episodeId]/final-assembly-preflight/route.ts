import { NextResponse } from "next/server";
import { and,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts,episodes,scenes,shots } from "@/lib/db/schema";

/** Read-only editorial preflight: never spends credits or assembles media. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select().from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 const sceneRows=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId)));
 const shotRows=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const issues:string[]=[];
 if(!approved)issues.push("Approve screenplay");
 if(!sceneRows.length)issues.push("No episode scenes");
 if(!shotRows.length)issues.push("No storyboard shots");
 const shotIds=new Set(shotRows.map(s=>s.id)),sceneIds=new Set(sceneRows.map(s=>s.id));
 for(const shot of shotRows){
  if(!shot.sceneId||!sceneIds.has(shot.sceneId))issues.push("Shot missing scene: "+shot.id);
  if(shot.isStale||shot.continuityStatus!=="passed")issues.push("Shot needs continuity approval: "+shot.id);
  if(shot.status!=="completed")issues.push("Shot not rendered: "+shot.id);
 }
 const runtime=shotRows.reduce((sum,s)=>sum+(s.duration||0),0);
 if(runtime<1200||runtime>1320)issues.push("20–22 minute episode runtime not met: "+runtime+" seconds");
 return NextResponse.json({episodeId,readyForFinalVideoAssembly:issues.length===0,issues,sceneCount:sceneRows.length,shotCount:shotIds.size,plannedRuntimeSeconds:runtime,approvedScreenplay:!!approved,requiresSoundtrackApproval:true,videoAssembled:false});
}
