import OpenAI from "openai";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {and,eq,asc} from "drizzle-orm";
import {db} from "@/lib/db";
import {assertProjectOwnership} from "@/lib/assert-project-ownership";
import {episodes,characters,episodeCharacters,scenes,shots,blackfistDirectorDrafts} from "@/lib/db/schema";

type Proposal={shotId:string;sceneId:string;cameraDirection:string;blockingNotes:string;transitionIn:string;transitionOut:string;reason:string};
const transitions=new Set(["cut","fade","dissolve","wipe","match cut"]);
function parseProposals(value:unknown,valid:Map<string,string>):Proposal[]|null{
 if(!Array.isArray(value)||value.length!==valid.size)return null;
 const result:Proposal[]=[];const seen=new Set<string>();
 for(const raw of value){
  if(!raw||typeof raw!=="object")return null;
  const p=raw as Record<string,unknown>;
  if(typeof p.shotId!=="string"||typeof p.sceneId!=="string"||valid.get(p.shotId)!==p.sceneId||seen.has(p.shotId))return null;
  if(typeof p.cameraDirection!=="string"||!p.cameraDirection.trim()||p.cameraDirection.length>200||typeof p.blockingNotes!=="string"||p.blockingNotes.length>2000||typeof p.reason!=="string"||p.reason.length>500||!transitions.has(p.transitionIn as string)||!transitions.has(p.transitionOut as string))return null;
  seen.add(p.shotId);
  result.push({shotId:p.shotId,sceneId:p.sceneId,cameraDirection:p.cameraDirection,blockingNotes:p.blockingNotes,transitionIn:p.transitionIn as string,transitionOut:p.transitionOut as string,reason:p.reason});
 }
 return result;
}
/** Explicitly requested paid AI assistance; stores only an editorial draft. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirmPaidAi?:boolean}|null;
 if(body?.confirmPaidAi!==true)return NextResponse.json({error:"Explicit paid AI confirmation required"},{status:400});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY not configured"},{status:503});
 const [episode]=await db.select({id:episodes.id,title:episodes.title,idea:episodes.idea,script:episodes.script,targetDuration:episodes.targetDuration}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const sceneRows=await db.select({id:scenes.id,title:scenes.title,description:scenes.description,sequence:scenes.sequence}).from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select({id:shots.id,sceneId:shots.sceneId,prompt:shots.prompt,sequence:shots.sequence,duration:shots.duration,motionScript:shots.motionScript}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId))).orderBy(asc(shots.sequence));
 if(!shotRows.length||shotRows.length>80||shotRows.some(s=>!s.sceneId||!sceneRows.some(scene=>scene.id===s.sceneId)))return NextResponse.json({error:"AI Director requires 1–80 storyboard shots assigned to episode scenes"},{status:409});
 const assigned=await db.select({character:characters}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 if(!assigned.length)return NextResponse.json({error:"Assign cast before requesting AI direction"},{status:409});
 const cast=assigned.map(({character:c})=>({id:c.id,name:c.name,description:c.description,canonLockEnabled:Boolean(c.canonLockEnabled),canonVisualLock:c.canonVisualLock}));
 const valid=new Map(shotRows.map(s=>[s.id,s.sceneId as string]));
 try{
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.responses.create({model:process.env.LIONCORE_OPENAI_MODEL||"gpt-5.5",instructions:"You are BlackFist Universe's cinematic television director. Return JSON object {proposals:[{shotId,sceneId,cameraDirection,blockingNotes,transitionIn,transitionOut,reason}]} with exactly one proposal for every input shot, matching original shotId and sceneId. Use transitions only: cut, fade, dissolve, wipe, match cut. Propose visual pacing, storm/weather continuity, spatially clear action, expressive blocking and motivated camera movement. Preserve established character identity, costume, powers and cast; do not invent or alter canon. Do not change script, shot duration or dialogue. Camera directions <=200 characters, blocking notes <=2000, reason <=500. Output is draft only; no video generation.",input:JSON.stringify({episode:{title:episode.title,idea:episode.idea,script:(episode.script||"").slice(0,6000),targetDuration:episode.targetDuration},cast,scenes:sceneRows,shots:shotRows}),text:{format:{type:"json_object"}}});
  const parsed=JSON.parse(response.output_text) as {proposals?:unknown};
  const proposals=parseProposals(parsed.proposals,valid);
  if(!proposals)return NextResponse.json({error:"AI returned invalid shot proposals; no draft saved"},{status:422});
  const draftId=randomUUID();
  await db.insert(blackfistDirectorDrafts).values({id:draftId,projectId:id,episodeId,proposalsJson:JSON.stringify(proposals),status:"draft_review_required"});
  return NextResponse.json({draftId,proposals,status:"draft_review_required",storyboardChanged:false,paidAiRequestMade:true,paidVideoGenerationStarted:false});
 }catch{return NextResponse.json({error:"AI direction request failed; no draft saved"},{status:502})}
}
