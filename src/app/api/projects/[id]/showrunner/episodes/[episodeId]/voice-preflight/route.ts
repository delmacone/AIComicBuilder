import { NextResponse } from "next/server";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts, shots, dialogues, characters, episodeCharacters } from "@/lib/db/schema";

/** Read-only preflight. No ElevenLabs credits are spent here. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 const episodeShots=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId))).orderBy(asc(shots.sequence));
 const cast=await db.select({id:characters.id,name:characters.name,voiceId:characters.elevenLabsVoiceId,voiceLocked:characters.voiceLockEnabled,voiceVersion:characters.voiceLockVersion}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const castById=new Map(cast.map(c=>[c.id,c]));
 const cues=[];
 let totalLines=0,missingVoiceCount=0,unapprovedCastCount=0,unrenderedCount=0;
 for(const shot of episodeShots){
  const lines=await db.select().from(dialogues).where(eq(dialogues.shotId,shot.id)).orderBy(asc(dialogues.sequence));
  for(const line of lines){
   const actor=castById.get(line.characterId);
   const issues:string[]=[];
   if(!actor){issues.push("Actor is not assigned to this episode");unapprovedCastCount++}
   else if(!actor.voiceLocked||!actor.voiceId){issues.push("Voice not approved and locked");missingVoiceCount++}
   if(!line.audioUrl){issues.push("Dialogue audio not rendered");unrenderedCount++}
   if(!line.text.trim())issues.push("Dialogue text missing");
   cues.push({dialogueId:line.id,shotId:shot.id,sceneId:shot.sceneId,shotSequence:shot.sequence,lineSequence:line.sequence,characterId:line.characterId,characterName:actor?.name||"Unassigned actor",voiceId:actor?.voiceId||null,voiceLockVersion:actor?.voiceVersion||null,text:line.text,audioUrl:line.audioUrl,issues});
   totalLines++;
  }
 }
 const missing:string[]=[];
 if(!approved)missing.push("Screenplay not approved");
 if(!episodeShots.length)missing.push("Storyboard shots missing");
 if(unapprovedCastCount)missing.push(unapprovedCastCount+" lines use unassigned actors");
 if(missingVoiceCount)missing.push(missingVoiceCount+" lines have unlocked or missing voices");
 if(unrenderedCount)missing.push(unrenderedCount+" lines need voice rendering");
 return NextResponse.json({readyForVoiceRendering:!!approved&&!!episodeShots.length&&unapprovedCastCount===0&&missingVoiceCount===0,readyForAudioMix:!!approved&&!!episodeShots.length&&cues.every(c=>c.issues.length===0),totalLines,missingVoiceCount,unapprovedCastCount,unrenderedCount,missing,cues,creditsSpent:false});
}
