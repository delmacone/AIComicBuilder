import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackfistSequences } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

type CueStatus="ready"|"needs_generation"|"planned";
type Cue={kind:"ambience"|"dialogue"|"sfx"|"music"|"transition";shotId?:string;description:string;text?:string;character?:string;existingAudioUrl?:string|null;status:CueStatus};
export async function GET(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}) {
 const {id,sequenceId}=await params;if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [seq]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id)));if(!seq)return NextResponse.json({error:"Sequence not found"},{status:404});
 let p:any={};try{p=JSON.parse(seq.audioPlan||"{}")}catch{return NextResponse.json({error:"Invalid audio plan"},{status:409})}
 const cues: Cue[]=[];
 for(const x of (p.ambience||[]) as any[]cues.push({kind:"ambience",shotId:x.startShotId,description:x.description||x.cue||"Ambience",status:"needs_generation" as CueStatus});
 for(const x of (p.dialogue||[]) as any[]cues.push({kind:"dialogue",shotId:x.shotId,description:`${x.character||"Character"} dialogue`,text:x.text,character:x.character,existingAudioUrl:x.existingAudioUrl||null,status:(x.existingAudioUrl?"ready":"needs_generation") as CueStatus});
 for(const x of (p.sfx||[]) as any[]cues.push({kind:"sfx",shotId:x.shotId,description:x.cue||"Sound effect",status:"needs_generation"});
 for(const x of (p.music||[]) as any[]cues.push({kind:"music",shotId:x.startShotId,description:x.cue||x.mood||"Music",status:"needs_generation"});
 for(const x of (p.transitions||[]) as any[]cues.push({kind:"transition",shotId:x.fromShotId,description:x.audioBridge||"Audio bridge",status:"planned" as CueStatus});
 const counts=cues.reduce((a,c)=>(a[c.kind]=(a[c.kind]||0)+1,a),{} as Record<string,number>);
 return NextResponse.json({sequenceId,status:seq.audioStatus,counts,cues,providerReadiness:{dialogue:"Existing dialogue audio is reused. Missing dialogue requires a configured voice/TTS provider.",sfx:"Planned and provider-ready; no SFX generation provider is configured in this repository yet.",music:"Planned and provider-ready; no music generation provider is configured in this repository yet."}});
}
