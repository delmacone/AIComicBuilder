import { NextResponse } from "next/server";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts,scenes,shots,dialogues,characters,episodeCharacters } from "@/lib/db/schema";

/** Read-only timeline. Does not claim speech durations without audio probing. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 const sceneRows=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const actors=await db.select({id:characters.id,name:characters.name,voiceLocked:characters.voiceLockEnabled,voiceId:characters.elevenLabsVoiceId}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const cast=new Map(actors.map(a=>[a.id,a]));
 let cursor=0;const timeline=[];const issues:string[]=[];
 if(!approved)issues.push("Screenplay approval required");
 for(const scene of sceneRows){
  const sceneStart=cursor;const sceneShots=shotRows.filter(s=>s.sceneId===scene.id).sort((a,b)=>a.sequence-b.sequence);
  for(const shot of sceneShots){
   const duration=shot.duration||10;const lines=await db.select().from(dialogues).where(eq(dialogues.shotId,shot.id)).orderBy(asc(dialogues.sequence));
   const cues=lines.map(line=>{
    const actor=cast.get(line.characterId);
    const startRatio=Number(line.startRatio??"0");const endRatio=Number(line.endRatio??"1");
    const valid=Number.isFinite(startRatio)&&Number.isFinite(endRatio)&&startRatio>=0&&endRatio<=1&&startRatio<endRatio;
    if(!valid)issues.push("Invalid dialogue timing for "+line.id);
    if(!actor?.voiceLocked||!actor.voiceId)issues.push("Voice not locked for "+line.id);
    if(!line.audioUrl)issues.push("Missing rendered dialogue "+line.id);
    return {dialogueId:line.id,characterId:line.characterId,characterName:actor?.name||"Unassigned actor",text:line.text,audioUrl:line.audioUrl,startSeconds:cursor+(valid?startRatio:0)*duration,endSeconds:cursor+(valid?endRatio:1)*duration,timingMode:"planned_window_not_measured_audio",issues:valid?[]:["Invalid timing ratio"]};
   });
   timeline.push({sceneId:scene.id,sceneTitle:scene.title,shotId:shot.id,shotSequence:shot.sequence,startSeconds:cursor,endSeconds:cursor+duration,durationSeconds:duration,dialogue:cues});
   cursor+=duration;
  }
  if(!sceneShots.length)issues.push("Scene has no storyboard shots: "+scene.id);
  if(cursor===sceneStart)continue;
 }
 if(!timeline.length)issues.push("No storyboard timeline");
 return NextResponse.json({episodeId,approved:!!approved,totalPlannedSeconds:cursor,readyForAudioMix:issues.length===0,issues,timeline,measuredSpeechTiming:false});
}
