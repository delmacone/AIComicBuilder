import { NextResponse } from "next/server";
import { and,asc,eq,inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences,blackfistSequenceAudioAssets,shots,dialogues } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { id as genId } from "@/lib/id";
import { mixSequenceAudio,type SequenceMixInput } from "@/lib/audio/sequence-audio-mixer";

export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id:projectId,sequenceId}=await params;if(!(await assertProjectOwnership(request,projectId)))return NextResponse.json({error:"Not found"},{status:404});
 const [seq]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,projectId)));if(!seq)return NextResponse.json({error:"Sequence not found"},{status:404});
 let ids:string[]=[];try{const p:unknown=JSON.parse(seq.shotIds||"[]");if(Array.isArray(p))ids=p.filter((x):x is string=>typeof x==="string")}catch{}if(!ids.length)return NextResponse.json({error:"Sequence has no shots"},{status:409});
 const ss=await db.select().from(shots).where(inArray(shots.id,ids)).orderBy(asc(shots.sequence));const offsets=new Map<string,number>();let total=0;for(const s of ss){offsets.set(s.id,total);total+=s.duration||10}
 const assets=await db.select().from(blackfistSequenceAudioAssets).where(and(eq(blackfistSequenceAudioAssets.sequenceId,sequenceId),eq(blackfistSequenceAudioAssets.status,"completed")));
 const dialogueRows=await db.select().from(dialogues).where(inArray(dialogues.shotId,ids));const dialogueByText=new Map(dialogueRows.map(d=>[`${d.shotId}\n${d.text}`,d]));
 const inputs:SequenceMixInput[]=[];
 for(const a of assets){if(!a.fileUrl||a.kind==="mix")continue;let start=offsets.get(a.shotId||"")||0;const volume=a.kind==="dialogue"?1:a.kind==="sfx"?.85:a.kind==="music"?.2:.28;if(a.kind==="dialogue"){const d=dialogueByText.get(`${a.shotId}\n${a.prompt}`);if(d){const dur=ss.find(s=>s.id===d.shotId)?.duration||10;start+=(parseFloat(String(d.startRatio||"0"))||0)*dur}}inputs.push({fileUrl:a.fileUrl,kind:a.kind as SequenceMixInput["kind"],startSeconds:start,volume})}
 if(!inputs.length)return NextResponse.json({error:"No completed sequence audio assets are ready to mix"},{status:409});
 const mixed=await mixSequenceAudio(inputs,total);const mixId=genId();await db.insert(blackfistSequenceAudioAssets).values({id:mixId,sequenceId,projectId,kind:"mix",prompt:"BlackFist sequence master mix",provider:"ffmpeg",model:"amix",status:"completed",fileUrl:mixed.url,metadata:JSON.stringify({durationSeconds:total,inputCount:inputs.length,dialogueDucking:"music/ambience preset below dialogue"})});
 await db.update(blackfistSequences).set({audioStatus:"mixed",updatedAt:new Date()}).where(eq(blackfistSequences.id,sequenceId));return NextResponse.json({sequenceId,audioStatus:"mixed",fileUrl:mixed.url,durationSeconds:total,inputCount:inputs.length});
}
