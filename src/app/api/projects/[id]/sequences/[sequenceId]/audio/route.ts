import OpenAI from "openai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackfistSequences, shots, dialogues, characters, scenes } from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function POST(request:Request,{params}:{params:Promise<{id:string;sequenceId:string}>}) {
 const {id,sequenceId}=await params; if(!(await assertProjectOwnership(request,id))) return NextResponse.json({error:"Not found"},{status:404});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"Lioncore is not connected"},{status:503});
 const [sequence]=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.id,sequenceId),eq(blackfistSequences.projectId,id)));
 if(!sequence)return NextResponse.json({error:"Sequence not found"},{status:404});
 const ids=JSON.parse(sequence.shotIds||"[]") as string[]; if(!ids.length)return NextResponse.json({error:"Sequence has no shots"},{status:400});
 const seqShots=await db.select().from(shots).where(inArray(shots.id,ids)).orderBy(asc(shots.sequence));
 const dialogue=await db.select({shotId:dialogues.shotId,text:dialogues.text,sequence:dialogues.sequence,characterName:characters.name,audioUrl:dialogues.audioUrl}).from(dialogues).innerJoin(characters,eq(dialogues.characterId,characters.id)).where(inArray(dialogues.shotId,ids)).orderBy(asc(dialogues.sequence));
 const scene=sequence.sceneId?(await db.select().from(scenes).where(eq(scenes.id,sequence.sceneId)))[0]:null;
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 const response=await client.responses.create({model:process.env.LIONCORE_OPENAI_MODEL||"gpt-6-luna",instructions:"You are Lioncore Audio Director. Design production audio for this exact multi-shot sequence. Do not invent spoken dialogue. Preserve supplied dialogue verbatim. Return JSON only with: ambience (continuous beds with description/startShotId/endShotId), dialogue (shotId,character,text,existingAudioUrl), sfx (shotId,cue,timing,intensity), music (cue,mood,startShotId,endShotId,duckUnderDialogue), and transitions (fromShotId,toShotId,audioBridge). Keep SFX cinematic but motivated by visible/story action. Avoid overloading every moment.",input:JSON.stringify({sequence:{id:sequence.id,name:sequence.name},scene:scene&&{title:scene.title,description:scene.description,continuityState:scene.continuityState},shots:seqShots.map(s=>({id:s.id,sequence:s.sequence,prompt:s.prompt,motionScript:s.motionScript,soundDesign:s.soundDesign,musicCue:s.musicCue,duration:s.duration})),dialogue})});
 const match=response.output_text.match(/\{[\s\S]*\}/); if(!match)return NextResponse.json({error:"Lioncore returned no valid audio plan"},{status:502});
 const plan=JSON.parse(match[0]); await db.update(blackfistSequences).set({audioPlan:JSON.stringify(plan),audioStatus:"planned",updatedAt:new Date()}).where(eq(blackfistSequences.id,sequence.id));
 return NextResponse.json({audioPlan:plan,audioStatus:"planned"});
}
