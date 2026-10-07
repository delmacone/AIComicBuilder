import { NextResponse } from "next/server";
import { and,desc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences,blackfistSequenceAudioAssets } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { attachSequenceAudio } from "@/lib/video/sequence-av";

export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id:projectId,sequenceId}=await params;if(!(await assertProjectOwnership(request,projectId)))return NextResponse.json({error:"Not found"},{status:404});
 const [seq]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,projectId)));if(!seq)return NextResponse.json({error:"Sequence not found"},{status:404});
 if(!seq.videoUrl)return NextResponse.json({error:"Generate or assign the Multi-Shot sequence video first"},{status:409});
 const [mix]=await db.select().from(blackfistSequenceAudioAssets).where(and(eq(blackfistSequenceAudioAssets.sequenceId,sequenceId),eq(blackfistSequenceAudioAssets.kind,"mix"),eq(blackfistSequenceAudioAssets.status,"completed"))).orderBy(desc(blackfistSequenceAudioAssets.createdAt)).limit(1);
 if(!mix?.fileUrl)return NextResponse.json({error:"Create the sequence master audio mix first"},{status:409});
 try{const result=await attachSequenceAudio(seq.videoUrl,mix.fileUrl);const qc={videoPresent:true,audioPresent:true,muxCompleted:true,audioStatus:seq.audioStatus,checkedAt:new Date().toISOString()};await db.update(blackfistSequences).set({finalVideoUrl:result.url,avStatus:"review_required",avQc:JSON.stringify(qc),updatedAt:new Date()}).where(eq(blackfistSequences.id,sequenceId));return NextResponse.json({sequenceId,finalVideoUrl:result.url,avStatus:"review_required",qc});}catch(error){await db.update(blackfistSequences).set({avStatus:"failed",avQc:JSON.stringify({error:error instanceof Error?error.message:"AV mux failed"}),updatedAt:new Date()}).where(eq(blackfistSequences.id,sequenceId));return NextResponse.json({error:error instanceof Error?error.message:"AV mux failed"},{status:500})}
}
