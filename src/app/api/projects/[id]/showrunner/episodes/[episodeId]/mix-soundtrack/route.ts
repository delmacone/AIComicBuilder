import { NextResponse } from "next/server";
import { and,asc,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts,scenes,shots,dialogues,characters,episodeCharacters } from "@/lib/db/schema";
import { probeDialogueSeconds } from "@/lib/audio/dialogue-duration";
import { mixSequenceAudio,type SequenceMixInput } from "@/lib/audio/sequence-audio-mixer";

type SoundCue={sceneId:string;kind:"ambience"|"sfx"|"music";fileUrl:string;offsetSeconds?:number;volume?:number};
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean;rightsConfirmed?:boolean;cues?:SoundCue[]}|null;
 if(body?.confirm!==true)return NextResponse.json({error:"Explicit confirmation required"},{status:400});
 if(!Array.isArray(body.cues)||body.cues.length>100)return NextResponse.json({error:"Supply at most 100 approved sound cues"},{status:400});
 if(body.cues.some(c=>c.kind==="music")&&body.rightsConfirmed!==true)return NextResponse.json({error:"Confirm rights for every music asset"},{status:409});
 const [approved]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 if(!approved)return NextResponse.json({error:"Approved screenplay required"},{status:409});
 const sceneRows=await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const castRows=await db.select({id:characters.id,voiceLocked:characters.voiceLockEnabled,voiceId:characters.elevenLabsVoiceId}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const cast=new Map(castRows.map(c=>[c.id,c]));
 const sceneStarts=new Map<string,number>();const inputs:SequenceMixInput[]=[];const issues:string[]=[];let cursor=0;
 for(const scene of sceneRows){
  sceneStarts.set(scene.id,cursor);
  const ordered=shotRows.filter(s=>s.sceneId===scene.id).sort((a,b)=>a.sequence-b.sequence);
  if(!ordered.length)issues.push("Scene without shots: "+scene.id);
  for(const shot of ordered){
   const duration=shot.duration||10;
   const lines=await db.select().from(dialogues).where(eq(dialogues.shotId,shot.id)).orderBy(asc(dialogues.sequence));
   for(const line of lines){
    if(!cast.get(line.characterId)?.voiceLocked||!cast.get(line.characterId)?.voiceId||!line.audioUrl){issues.push("Dialogue not approved or recorded: "+line.id);continue}
    const start=Number(line.startRatio??"0"),end=Number(line.endRatio??"1");
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1||start>=end){issues.push("Invalid dialogue window: "+line.id);continue}
    try{const seconds=await probeDialogueSeconds(line.audioUrl);if(seconds>(end-start)*duration+0.05)issues.push("Speech exceeds window: "+line.id);else inputs.push({fileUrl:line.audioUrl,kind:"dialogue",startSeconds:cursor+start*duration,volume:1})}catch{issues.push("Recording missing or invalid: "+line.id)}
   }
   cursor+=duration;
  }
 }
 if(!sceneRows.length||!shotRows.length)issues.push("Storyboard incomplete");
 for(const cue of body.cues){
  const sceneStart=sceneStarts.get(cue.sceneId);
  if(sceneStart===undefined||!["ambience","sfx","music"].includes(cue.kind)){issues.push("Invalid cue scene or kind");continue}
  if(typeof cue.fileUrl!=="string"||!cue.fileUrl.startsWith("/api/uploads/")){issues.push("Cue must reference a local uploaded audio asset");continue}
  const offset=cue.offsetSeconds??0,volume=cue.volume??(cue.kind==="music"?.18:cue.kind==="ambience"?.25:.75);
  if(!Number.isFinite(offset)||offset<0||!Number.isFinite(volume)||volume<0||volume>1){issues.push("Invalid cue timing or volume");continue}
  try{await probeDialogueSeconds(cue.fileUrl);inputs.push({fileUrl:cue.fileUrl,kind:cue.kind,startSeconds:sceneStart+offset,volume})}catch{issues.push("Sound asset unavailable: "+cue.fileUrl)}
 }
 if(!inputs.length)issues.push("No mixable audio assets");
 if(issues.length)return NextResponse.json({error:"Soundtrack review required",issues},{status:409});
 try{const mix=await mixSequenceAudio(inputs,cursor);return NextResponse.json({episodeId,status:"review_required",mixUrl:mix.url,durationSeconds:cursor,dialogueInputs:inputs.filter(x=>x.kind==="dialogue").length,soundInputs:body.cues.length,musicDucking:"static low-level music; dynamic sidechain ducking not implemented",message:"Review soundtrack created; final editorial approval required"})}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Soundtrack mix failed"},{status:500})}
}
