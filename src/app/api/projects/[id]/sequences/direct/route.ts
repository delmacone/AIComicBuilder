import OpenAI from "openai";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scenes, shots, projects, characters, virtualSets } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params; if(!(await assertProjectOwnership(request,id))) return NextResponse.json({error:"Not found"},{status:404});
 if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"Lioncore is not connected"},{status:503});
 const body=await request.json() as {sceneId?:string}; if(!body.sceneId)return NextResponse.json({error:"Scene required"},{status:400});
 const [scene]=await db.select().from(scenes).where(and(eq(scenes.id,body.sceneId),eq(scenes.projectId,id))); if(!scene)return NextResponse.json({error:"Scene not found"},{status:404});
 const [project]=await db.select().from(projects).where(eq(projects.id,id));
 const cast=await db.select().from(characters).where(eq(characters.projectId,id));
 const sceneShots=await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.sceneId,scene.id))).orderBy(asc(shots.sequence));
 const set=scene.virtualSetId ? (await db.select().from(virtualSets).where(and(eq(virtualSets.id,scene.virtualSetId),eq(virtualSets.projectId,id))))[0] : null;
 if(sceneShots.length<2)return NextResponse.json({error:"Scene needs at least 2 storyboard shots"},{status:400});
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
 const response=await client.responses.create({
  model:process.env.LIONCORE_OPENAI_MODEL||"gpt-6-luna",
  instructions:"You are Lioncore Sequence Director. Select 2 to 5 existing storyboard shots that form the strongest coherent multi-shot sequence. Preserve story order. Prefer a cinematic progression such as establishing, action/reaction, impact and consequence when supported by the source. Never invent a shot or change canon. Return JSON only: {shotIds:[existing ids], rationale:string, direction:[{shotId:string,role:string,cameraNote:string,continuityNote:string}]}.",
  input:JSON.stringify({project:{title:project?.title,style:project?.visualStylePreset},scene:{id:scene.id,title:scene.title,description:scene.description,continuityState:scene.continuityState},virtualSet:set&&{name:set.name,description:set.description,location:set.location,timeOfDay:set.timeOfDay,weather:set.weather,lighting:set.lighting,layoutState:set.layoutState,propsState:set.propsState,damageState:set.damageState},cast:cast.map(c=>({id:c.id,name:c.name,canonLocked:c.canonLockEnabled===1})),shots:sceneShots.map(s=>({id:s.id,sequence:s.sequence,prompt:s.prompt,motionScript:s.motionScript,cameraDirection:s.cameraDirection,duration:s.duration,continuityStatus:s.continuityStatus}))})
 });
 const match=response.output_text.match(/\{[\s\S]*\}/); if(!match)return NextResponse.json({error:"Lioncore returned no valid sequence plan"},{status:502});
 let plan:{shotIds?:string[];rationale?:string;direction?:unknown[]}; try{plan=JSON.parse(match[0]) as typeof plan;}catch{return NextResponse.json({error:"Lioncore returned malformed sequence JSON"},{status:502});}
 const valid=new Set(sceneShots.map(s=>s.id)); const shotIds=(plan.shotIds||[]).filter(x=>valid.has(x)).slice(0,5);
 if(shotIds.length<2)return NextResponse.json({error:"Lioncore did not return enough valid shots"},{status:502});
 shotIds.sort((a,b)=>sceneShots.findIndex(s=>s.id===a)-sceneShots.findIndex(s=>s.id===b));
 return NextResponse.json({shotIds,rationale:plan.rationale||"",direction:plan.direction||[]});
}
