import { NextResponse } from "next/server";
import { and,eq,desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { episodes,blackfistEpisodeReviewMasters } from "@/lib/db/schema";
import { id as genId } from "@/lib/id";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { muxReviewedEpisode } from "@/lib/video/blackfist-soundtrack-mux";

/** Return saved, unpublished editorial revisions. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const masters=await db.select().from(blackfistEpisodeReviewMasters).where(and(eq(blackfistEpisodeReviewMasters.projectId,id),eq(blackfistEpisodeReviewMasters.episodeId,episodeId))).orderBy(desc(blackfistEpisodeReviewMasters.createdAt)).limit(30);
 return NextResponse.json({episodeId,masters});
}
/** Explicit editorial action: combines local review media, never publishes. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean;videoUrl?:string;soundtrackUrl?:string;videoReviewed?:boolean;soundtrackReviewed?:boolean}|null;
 if(!body?.confirm||!body.videoReviewed||!body.soundtrackReviewed)return NextResponse.json({error:"Editor must explicitly confirm both video and soundtrack review"},{status:409});
 if(typeof body.videoUrl!=="string"||typeof body.soundtrackUrl!=="string")return NextResponse.json({error:"Video and soundtrack URLs required"},{status:400});
 try{
  const result=await muxReviewedEpisode(body.videoUrl,body.soundtrackUrl,id,episodeId);
  await db.insert(blackfistEpisodeReviewMasters).values({id:genId(),projectId:id,episodeId,videoSourceUrl:body.videoUrl,soundtrackSourceUrl:body.soundtrackUrl,fileUrl:result.fileUrl,videoDurationSeconds:result.videoDurationSeconds,soundtrackDurationSeconds:result.soundtrackDurationSeconds,status:"review_required"});
  return NextResponse.json({episodeId,...result,message:"Video and soundtrack review master created. Final publication requires separate approval."});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Media assembly failed"},{status:500})}
}
