import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts, episodes, scenes } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const rows=await db.select().from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId))).orderBy(desc(blackfistScreenplayDrafts.version));
 return NextResponse.json({drafts:rows.map(x=>({id:x.id,version:x.version,status:x.status,createdAt:x.createdAt,approvedAt:x.approvedAt}))});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const b=await request.json().catch(()=>null) as {draftId?:string;confirm?:boolean}|null;
 if(!b?.confirm||typeof b.draftId!=="string")return NextResponse.json({error:"Explicit approval confirmation and draftId required"},{status:400});
 const [episode]=await db.select().from(episodes).where(and(eq(episodes.projectId,id),eq(episodes.id,episodeId)));
 const [draft]=await db.select().from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.id,b.draftId)));
 if(!episode||!draft)return NextResponse.json({error:"Episode or screenplay not found"},{status:404});
 if(draft.status!=="review_required")return NextResponse.json({error:"Draft already reviewed"},{status:409});
 const [latest]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(eq(blackfistScreenplayDrafts.episodeId,episodeId)).orderBy(desc(blackfistScreenplayDrafts.version)).limit(1);
 if(latest?.id!==draft.id)return NextResponse.json({error:"A newer screenplay draft exists"},{status:409});
 const existing=await db.select({id:scenes.id}).from(scenes).where(eq(scenes.episodeId,episodeId));
 if(existing.length)return NextResponse.json({error:"Episode already contains production scenes. Approval will not overwrite existing work."},{status:409});
 const parsed=JSON.parse(draft.screenplayJson) as Array<{heading:string;summary:string;location:string;dialogue:Array<{characterId:string;line:string}>;shots:Array<{description:string;durationSeconds:number}>}>;
 if(!Array.isArray(parsed)||!parsed.length||parsed.length>30)return NextResponse.json({error:"Invalid stored screenplay"},{status:422});
 const approvedAt=new Date();
 await db.transaction(async tx=>{
  for(let i=0;i<parsed.length;i++){
   const scene=parsed[i];
   await tx.insert(scenes).values({id:randomUUID(),projectId:id,episodeId,title:scene.heading,description:JSON.stringify({summary:scene.summary,location:scene.location,dialogue:scene.dialogue,plannedShots:scene.shots}),sequence:i+1});
  }
  await tx.update(blackfistScreenplayDrafts).set({status:"approved",approvedAt}).where(eq(blackfistScreenplayDrafts.id,draft.id));
  await tx.update(episodes).set({outline:parsed.map(s=>s.heading+" — "+s.summary).join("\n"),updatedAt:approvedAt}).where(eq(episodes.id,episodeId));
 });
 return NextResponse.json({approved:true,sceneCount:parsed.length,episodeId,draftId:draft.id});
}
