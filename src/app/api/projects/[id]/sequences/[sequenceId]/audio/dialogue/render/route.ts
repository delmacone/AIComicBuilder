import { NextResponse } from "next/server";
import { and,asc,eq,inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences,blackfistSequenceAudioAssets,dialogues,characters } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { id as genId } from "@/lib/id";
import { generateElevenLabsSpeech } from "@/lib/audio/elevenlabs";
import { saveSequenceAudio } from "@/lib/audio/sequence-audio-storage";

export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id:projectId,sequenceId}=await params;
 if(!(await assertProjectOwnership(request,projectId)))return NextResponse.json({error:"Not found"},{status:404});
 if(!process.env.ELEVENLABS_API_KEY)return NextResponse.json({error:"ElevenLabs is not connected"},{status:503});
 const [sequence]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,projectId)));
 if(!sequence)return NextResponse.json({error:"Sequence not found"},{status:404});
 let shotIds:string[]=[];try{const parsed:unknown=JSON.parse(sequence.shotIds||"[]");if(Array.isArray(parsed))shotIds=parsed.filter((x):x is string=>typeof x==="string")}catch{}
 if(!shotIds.length)return NextResponse.json({error:"Sequence has no shots"},{status:409});
 const lines=await db.select({id:dialogues.id,shotId:dialogues.shotId,text:dialogues.text,sequence:dialogues.sequence,audioUrl:dialogues.audioUrl,characterId:characters.id,characterName:characters.name,voiceId:characters.elevenLabsVoiceId,voiceLocked:characters.voiceLockEnabled,voiceVersion:characters.voiceLockVersion}).from(dialogues).innerJoin(characters,eq(dialogues.characterId,characters.id)).where(inArray(dialogues.shotId,shotIds)).orderBy(asc(dialogues.sequence));
 const results=[];
 for(const line of lines){
  if(line.audioUrl){results.push({dialogueId:line.id,status:"reused",fileUrl:line.audioUrl});continue}
  if(!line.voiceLocked||!line.voiceId){results.push({dialogueId:line.id,character:line.characterName,status:"review_required",reason:"Character voice is not locked"});continue}
  const assetId=genId();
  await db.insert(blackfistSequenceAudioAssets).values({id:assetId,sequenceId,projectId,shotId:line.shotId,kind:"dialogue",prompt:line.text,provider:"elevenlabs",model:"eleven_multilingual_v2",status:"generating",metadata:JSON.stringify({dialogueId:line.id,characterId:line.characterId,characterName:line.characterName,voiceId:line.voiceId,voiceLockVersion:line.voiceVersion})});
  try{
   const audio=await generateElevenLabsSpeech({voiceId:line.voiceId,text:line.text});
   const saved=saveSequenceAudio(audio.bytes,"mp3");
   await db.update(blackfistSequenceAudioAssets).set({status:"completed",fileUrl:saved.url,metadata:JSON.stringify({dialogueId:line.id,characterId:line.characterId,characterName:line.characterName,voiceId:line.voiceId,voiceLockVersion:line.voiceVersion,characterCost:audio.characterCost}),updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   await db.update(dialogues).set({audioUrl:saved.url}).where(eq(dialogues.id,line.id));
   results.push({dialogueId:line.id,character:line.characterName,status:"completed",fileUrl:saved.url});
  }catch(error){
   await db.update(blackfistSequenceAudioAssets).set({status:"failed",metadata:JSON.stringify({dialogueId:line.id,error:error instanceof Error?error.message:"Generation failed"}),updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   results.push({dialogueId:line.id,character:line.characterName,status:"failed"});
  }
 }
 const review=results.filter(x=>x.status==="failed"||x.status==="review_required").length;
 await db.update(blackfistSequences).set({audioStatus:review?"review_required":"rendered",updatedAt:new Date()}).where(eq(blackfistSequences.id,sequenceId));
 return NextResponse.json({sequenceId,completed:results.filter(x=>x.status==="completed").length,reused:results.filter(x=>x.status==="reused").length,reviewRequired:review,dialogue:results,audioStatus:review?"review_required":"rendered"});
}
