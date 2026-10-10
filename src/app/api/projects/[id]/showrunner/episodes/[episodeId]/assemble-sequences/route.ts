import { NextResponse } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistSequences, episodes, scenes } from "@/lib/db/schema";
import { assembleApprovedSequences } from "@/lib/video/blackfist-episode-assemble";

function hasHumanApproval(raw:string):boolean {
 try { const qc=JSON.parse(raw) as {humanApproved?:unknown};return qc.humanApproved===true; } catch { return false; }
}
/** Editorial preview only: uses stored scene order and approved sequence masters. Does not publish. */
export async function POST(request: Request, { params }: { params: Promise<{id:string;episodeId:string}> }) {
 const {id,episodeId}=await params;
 if (!(await assertProjectOwnership(request,id))) return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if (!episode) return NextResponse.json({error:"Episode not found"},{status:404});
 const body=await request.json().catch(()=>null);
 if (body?.confirm!==true) return NextResponse.json({error:"Explicit assembly confirmation required"},{status:400});
 const sceneRows=await db.select({id:scenes.id,title:scenes.title}).from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence),asc(scenes.createdAt));
 if (!sceneRows.length) return NextResponse.json({error:"No episode scenes to assemble"},{status:409});
 const sequences=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.projectId,id),eq(blackfistSequences.episodeId,episodeId)));
 const urls:string[]=[];
 for (const scene of sceneRows) {
  const approved=sequences.filter(s=>s.sceneId===scene.id&&s.avStatus==="approved"&&s.finalVideoUrl&&hasHumanApproval(s.avQc));
  if (approved.length!==1) return NextResponse.json({error:`Scene "${scene.title||scene.id}" needs exactly one human-approved final AV sequence; found ${approved.length}`},{status:409});
  urls.push(approved[0].finalVideoUrl!);
 }
 if (sequences.some(s=>!s.sceneId||!sceneRows.some(scene=>scene.id===s.sceneId))) return NextResponse.json({error:"Episode has unassigned sequence(s); review before assembly"},{status:409});
 try {
  const result=await assembleApprovedSequences(urls,id);
  return NextResponse.json({episodeId,sceneCount:sceneRows.length,...result,status:"review_required",published:false});
 } catch(error) {
  return NextResponse.json({error:error instanceof Error?error.message:"Episode assembly failed"},{status:422});
 }
}
