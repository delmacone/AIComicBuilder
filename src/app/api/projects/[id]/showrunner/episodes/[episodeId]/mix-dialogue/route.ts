import { NextResponse } from "next/server";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts,scenes,shots,dialogues,characters,episodeCharacters } from "@/lib/db/schema";
import { probeDialogueSeconds } from "@/lib/audio/dialogue-duration";
import { mixSequenceAudio,type SequenceMixInput } from "@/lib/audio/sequence-audio-mixer";

/** A review-only episode dialogue master. No music or effects are fabricated. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean}|null;
 if(body?.confirm!==true)return NextResponse.json({error:"Confirm audio mix creation"},{status:400});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 if(!approved)return NextResponse.json({error:"Approved screenplay required"},{status:409});
 const sceneRows=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const castRows=await db.select({id:characters.id,voiceLocked:characters.voiceLockEnabled,voiceId:characters.elevenLabsVoiceId}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const cast=new Map(castRows.map(c=>[c.id,c]));
 const inputs:SequenceMixInput[]=[];const issues:string[]=[];let cursor=0;
 for(const scene of sceneRows){
  const ordered=shotRows.filter(s=>s.sceneId===scene.id).sort((a,b)=>a.sequence-b.sequence);
  if(!ordered.length)issues.push("Scene without shots: "+scene.id);
  for(const shot of ordered){
   const duration=shot.duration||10;
   const lines=await db.select().from(dialogues).where(eq(dialogues.shotId,shot.id)).orderBy(asc(dialogues.sequence));
   for(const line of lines){
    if(!cast.get(line.characterId)?.voiceLocked||!cast.get(line.characterId)?.voiceId){issues.push("Voice approval missing: "+line.id);continue}
    if(!line.audioUrl){issues.push("Recording missing: "+line.id);continue}
    const startRatio=Number(line.startRatio??"0"),endRatio=Number(line.endRatio??"1");
    if(!Number.isFinite(startRatio)||!Number.isFinite(endRatio)||startRatio<0||endRatio>1||startRatio>=endRatio){issues.push("Invalid dialogue window: "+line.id);continue}
    try{
     const seconds=await probeDialogueSeconds(line.audioUrl);
     if(seconds>(endRatio-startRatio)*duration+0.05){issues.push("Speech exceeds dialogue window: "+line.id);continue}
     inputs.push({fileUrl:line.audioUrl,kind:"dialogue",startSeconds:cursor+startRatio*duration,volume:1});
    }catch{issues.push("Cannot probe recording: "+line.id)}
   }
   cursor+=duration;
  }
 }
 if(!sceneRows.length||!shotRows.length)issues.push("Episode storyboard incomplete");
 if(!inputs.length)issues.push("No recorded dialogue to mix");
 if(issues.length)return NextResponse.json({error:"Audio mix blocked pending dialogue review",issues},{status:409});
 try{
  const result=await mixSequenceAudio(inputs,cursor);
  return NextResponse.json({episodeId,status:"review_required",mixUrl:result.url,durationSeconds:cursor,dialogueInputs:inputs.length,includesMusic:false,includesAmbience:false,includesSfx:false,message:"Dialogue-only review master created; not a final episode sound mix"});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Audio mix failed"},{status:500})}
}
