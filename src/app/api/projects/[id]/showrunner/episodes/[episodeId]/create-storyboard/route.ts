import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts, scenes, shots, dialogues, episodeCharacters, characters } from "@/lib/db/schema";

type PlannedScene={heading:string;summary:string;location:string;dialogue:Array<{characterId:string;line:string}>;shots:Array<{description:string;durationSeconds:number}>};
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const b=await request.json().catch(()=>null) as {confirm?:boolean}|null;
 if(b?.confirm!==true)return NextResponse.json({error:"Explicit storyboard conversion confirmation required"},{status:400});
 const [draft]=await db.select().from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).orderBy(asc(blackfistScreenplayDrafts.version)).limit(1);
 if(!draft)return NextResponse.json({error:"An approved screenplay is required"},{status:409});
 const episodeScenes=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 if(!episodeScenes.length)return NextResponse.json({error:"Approved screenplay scenes missing"},{status:409});
 const existing=await db.select({id:shots.id}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 if(existing.length)return NextResponse.json({error:"Storyboard already has shots; existing production will not be overwritten"},{status:409});
 let screenplay:PlannedScene[];
 try{screenplay=JSON.parse(draft.screenplayJson) as PlannedScene[]}catch{return NextResponse.json({error:"Stored screenplay invalid"},{status:422})}
 if(!Array.isArray(screenplay)||screenplay.length!==episodeScenes.length||screenplay.length>30)return NextResponse.json({error:"Scene count does not match approved screenplay"},{status:409});
 const assigned=await db.select({id:characters.id}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const allowed=new Set(assigned.map(c=>c.id));
 let total=0;
 for(const scene of screenplay){if(!Array.isArray(scene.shots)||!Array.isArray(scene.dialogue)||scene.shots.length<1||scene.shots.length>15)return NextResponse.json({error:"Invalid shot plan"},{status:422});total+=scene.shots.length;for(const line of scene.dialogue)if(!allowed.has(line.characterId))return NextResponse.json({error:"Cast changed since screenplay approval; review required"},{status:409});for(const shot of scene.shots)if(typeof shot.description!=="string"||!Number.isFinite(shot.durationSeconds)||shot.durationSeconds<1||shot.durationSeconds>30)return NextResponse.json({error:"Invalid shot timing"},{status:422})}
 if(total>300)return NextResponse.json({error:"Storyboard too large"},{status:422});
 const result=await db.transaction(async tx=>{
  let shotCount=0,dialogueCount=0;
  for(let i=0;i<screenplay.length;i++){
   const scene=screenplay[i];const sceneId=episodeScenes[i].id;
   for(let j=0;j<scene.shots.length;j++){
    const plan=scene.shots[j];const shotId=randomUUID();
    await tx.insert(shots).values({id:shotId,projectId:id,episodeId,sceneId,sequence:j+1,prompt:plan.description.slice(0,1200),videoScript:scene.summary.slice(0,2000),cameraDirection:"cinematic",duration:Math.round(plan.durationSeconds),continuityStatus:"pending"});
    shotCount++;
    if(j===0)for(let k=0;k<scene.dialogue.length;k++){const line=scene.dialogue[k];await tx.insert(dialogues).values({id:randomUUID(),shotId,characterId:line.characterId,text:line.line,sequence:k+1});dialogueCount++}
   }
  }
  return {shotCount,dialogueCount};
 });
 return NextResponse.json({created:true,episodeId,scenes:episodeScenes.length,...result,continuityReviewRequired:true,videoGenerationStarted:false});
}
