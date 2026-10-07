import { NextResponse } from "next/server";
import { and,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function GET(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id,sequenceId}=await params;if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [s]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id)));if(!s)return NextResponse.json({error:"Sequence not found"},{status:404});
 let qc:Record<string,unknown>={};try{qc=JSON.parse(s.avQc||"{}") as Record<string,unknown>}catch{}
 const checks={video:Boolean(s.videoUrl),audioMixed:s.audioStatus==="mixed"||Boolean(s.finalVideoUrl),avMaster:Boolean(s.finalVideoUrl),humanApproved:s.avStatus==="approved"};
 const ready=checks.video&&checks.audioMixed&&checks.avMaster&&checks.humanApproved;
 return NextResponse.json({sequenceId,checks,ready,avStatus:s.avStatus,qc,finalVideoUrl:s.finalVideoUrl});
}
