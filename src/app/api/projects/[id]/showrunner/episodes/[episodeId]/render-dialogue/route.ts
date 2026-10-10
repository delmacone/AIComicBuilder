import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts, shots, dialogues, characters, episodeCharacters, blackfistSequenceAudioAssets } from "@/lib/db/schema";
import { id as genId } from "@/lib/id";
import { generateElevenLabsSpeech } from "@/lib/audio/elevenlabs";
import { saveSequenceAudio } from "@/lib/audio/sequence-audio-storage";

/** Explicitly authorised, capped paid TTS batch. Existing recordings are never regenerated. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean;maxLines?:number}|null;
 if(body?.confirm!==true)return NextResponse.json({error:"Confirm paid voice rendering explicitly"},{status:400});
 const maxLines=body.maxLines??5;
 if(!Number.isInteger(maxLines)||maxLines<1||maxLines>10)return NextResponse.json({error:"maxLines must be between 1 and 10"},{status:400});
 if(!process.env.ELEVENLABS_API_KEY)return NextResponse.json({error:"ElevenLabs is not connected"},{status:503});
 const approved=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 if(!approved.length)return NextResponse.json({error:"Approved screenplay required"},{status:409});
 const episodeShots=await db.select({id:shots.id,sceneId:shots.sceneId,sequence:shots.sequence}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId))).orderBy(asc(shots.sequence));
 if(!episodeShots.length)return NextResponse.json({error:"Storyboard shots missing"},{status:409});
 const shotIds=episodeShots.map(s=>s.id);
 const lines=await db.select({id:dialogues.id,shotId:dialogues.shotId,text:dialogues.text,sequence:dialogues.sequence,audioUrl:dialogues.audioUrl,characterId:dialogues.characterId}).from(dialogues).where(inArray(dialogues.shotId,shotIds)).orderBy(asc(dialogues.sequence));
 const assigned=await db.select({id:characters.id,name:characters.name,voiceId:characters.elevenLabsVoiceId,voiceLocked:characters.voiceLockEnabled,voiceVersion:characters.voiceLockVersion}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const cast=new Map(assigned.map(c=>[c.id,c]));
 const invalid=lines.filter(l=>!cast.get(l.characterId)?.voiceLocked||!cast.get(l.characterId)?.voiceId||!l.text.trim());
 if(invalid.length)return NextResponse.json({error:"All dialogue must have approved cast, locked voices and text before paid rendering",blockedDialogueIds:invalid.map(l=>l.id)},{status:409});
 const pending=lines.filter(l=>!l.audioUrl).sort((a,b)=>shotIds.indexOf(a.shotId)-shotIds.indexOf(b.shotId)||a.sequence-b.sequence).slice(0,maxLines);
 const results:Array<{dialogueId:string;status:string;audioUrl?:string}>=[];
 for(const line of pending){
  const actor=cast.get(line.characterId)!;
  const assetId=genId();
  await db.insert(blackfistSequenceAudioAssets).values({id:assetId,projectId:id,shotId:line.shotId,kind:"dialogue",prompt:line.text,provider:"elevenlabs",model:"eleven_multilingual_v2",status:"generating",metadata:JSON.stringify({episodeId,dialogueId:line.id,characterId:actor.id,voiceId:actor.voiceId,voiceLockVersion:actor.voiceVersion})});
  try{
   const audio=await generateElevenLabsSpeech({voiceId:actor.voiceId!,text:line.text});
   const saved=saveSequenceAudio(audio.bytes,"mp3");
   await db.update(blackfistSequenceAudioAssets).set({status:"completed",fileUrl:saved.url,updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   await db.update(dialogues).set({audioUrl:saved.url}).where(and(eq(dialogues.id,line.id),eq(dialogues.shotId,line.shotId)));
   results.push({dialogueId:line.id,status:"completed",audioUrl:saved.url});
  }catch{
   await db.update(blackfistSequenceAudioAssets).set({status:"failed",updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   results.push({dialogueId:line.id,status:"failed"});
  }
 }
 return NextResponse.json({episodeId,attempted:results.length,completed:results.filter(x=>x.status==="completed").length,failed:results.filter(x=>x.status==="failed").length,remaining:lines.filter(l=>!l.audioUrl).length-results.filter(x=>x.status==="completed").length,results});
}
