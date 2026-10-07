import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistSequences,blackfistSequenceAudioAssets } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { id as genId } from "@/lib/id";
import { generateElevenLabsSfx } from "@/lib/audio/elevenlabs";
import { saveSequenceAudio } from "@/lib/audio/sequence-audio-storage";

type PlanCue={shotId?:string;cue?:string;description?:string;timing?:string;intensity?:string};

export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}){
 const {id:projectId,sequenceId}=await params;
 if(!(await assertProjectOwnership(request,projectId)))return NextResponse.json({error:"Not found"},{status:404});
 if(!process.env.ELEVENLABS_API_KEY)return NextResponse.json({error:"ElevenLabs is not connected"},{status:503});
 const [sequence]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,projectId)));
 if(!sequence)return NextResponse.json({error:"Sequence not found"},{status:404});
 let plan:Record<string,unknown>;try{const parsed:unknown=JSON.parse(sequence.audioPlan||"{}");if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error();plan=parsed as Record<string,unknown>}catch{return NextResponse.json({error:"Sequence audio plan is invalid"},{status:409})}
 const requested=await request.json().catch(()=>({})) as {kinds?:string[]};
 const kinds=new Set(requested.kinds?.length?requested.kinds:["sfx","ambience"]);
 const inputs:{kind:"sfx"|"ambience";cue:PlanCue}[]=[];
 if(kinds.has("sfx")&&Array.isArray(plan.sfx))for(const cue of plan.sfx as PlanCue[])inputs.push({kind:"sfx",cue});
 if(kinds.has("ambience")&&Array.isArray(plan.ambience))for(const cue of plan.ambience as PlanCue[])inputs.push({kind:"ambience",cue});
 if(!inputs.length)return NextResponse.json({error:"No renderable SFX or ambience cues in this plan"},{status:400});
 const results=[];
 for(const item of inputs){
  const prompt=String(item.cue.cue||item.cue.description||"").trim();if(!prompt)continue;
  const assetId=genId();
  await db.insert(blackfistSequenceAudioAssets).values({id:assetId,sequenceId,projectId,shotId:typeof item.cue.shotId==="string"?item.cue.shotId:null,kind:item.kind,prompt,provider:"elevenlabs",model:"eleven_text_to_sound_v2",status:"generating",metadata:JSON.stringify({timing:item.cue.timing||null,intensity:item.cue.intensity||null})});
  try{
   const audio=await generateElevenLabsSfx({text:prompt,loop:item.kind==="ambience"});
   const saved=saveSequenceAudio(audio.bytes,"mp3");
   await db.update(blackfistSequenceAudioAssets).set({status:"completed",fileUrl:saved.url,metadata:JSON.stringify({timing:item.cue.timing||null,intensity:item.cue.intensity||null,characterCost:audio.characterCost}),updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   results.push({id:assetId,kind:item.kind,status:"completed",fileUrl:saved.url});
  }catch(error){
   await db.update(blackfistSequenceAudioAssets).set({status:"failed",metadata:JSON.stringify({error:error instanceof Error?error.message:"Generation failed"}),updatedAt:new Date()}).where(eq(blackfistSequenceAudioAssets.id,assetId));
   results.push({id:assetId,kind:item.kind,status:"failed"});
  }
 }
 const failed=results.filter(x=>x.status==="failed").length;
 await db.update(blackfistSequences).set({audioStatus:failed?"review_required":"rendered",updatedAt:new Date()}).where(eq(blackfistSequences.id,sequenceId));
 return NextResponse.json({sequenceId,rendered:results.length-failed,failed,assets:results,audioStatus:failed?"review_required":"rendered"});
}
