import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { episodes, scenes, shots, blackfistDirectorDrafts } from "@/lib/db/schema";

type Proposal = { shotId:string;sceneId:string;cameraDirection:string;blockingNotes:string;transitionIn:string;transitionOut:string;reason:string };
/** Save non-destructive, rule-based direction proposals; no paid generation or storyboard edits. */
export async function POST(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const body=await request.json().catch(()=>null) as {confirm?:boolean}|null;
 if(body?.confirm!==true)return NextResponse.json({error:"Explicit proposal confirmation required"},{status:400});
 const [episode]=await db.select({id:episodes.id,title:episodes.title}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const sceneRows=await db.select({id:scenes.id,title:scenes.title,description:scenes.description,continuityState:scenes.continuityState}).from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select({id:shots.id,sceneId:shots.sceneId,sequence:shots.sequence,prompt:shots.prompt,cameraDirection:shots.cameraDirection,motionScript:shots.motionScript,transitionIn:shots.transitionIn,transitionOut:shots.transitionOut}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId))).orderBy(asc(shots.sequence));
 if(!shotRows.length)return NextResponse.json({error:"Create storyboard shots before proposing direction"},{status:409});
 if(shotRows.length>300)return NextResponse.json({error:"Storyboard exceeds director draft limit"},{status:422});
 const stormEpisode=/general jamaica|the storm/i.test(episode.title);
 const proposals:Proposal[]=[];
 for(const scene of sceneRows){
  const ordered=shotRows.filter(shot=>shot.sceneId===scene.id);
  for(let i=0;i<ordered.length;i++){
   const shot=ordered[i];
   const action=(shot.prompt||"").toLowerCase();
   const sceneContext=((scene.title||"")+" "+(scene.description||"")).toLowerCase();
   const stormAction=stormEpisode&&/storm|lightning|thunder|wind|rain|cloud|electric|tempest/.test(action+" "+sceneContext);
   const actionBeat=/strike|attack|fight|impact|blast|collision/.test(action);
   const emotionalBeat=/emotion|react|whisper|grief|fear|hesitat/.test(action);
   const cameraDirection=stormAction&&actionBeat?"low-angle tracking shot":stormAction?"wide atmospheric crane shot":/chase|run|pursu/.test(action)?"tracking shot":/reveal|arriv|establish/.test(action)?"wide establishing shot":emotionalBeat?"close-up":actionBeat?"dynamic three-quarter action shot":"medium cinematic shot";
   const geography="Preserve actor screen positions, eyelines, costume, location and weather continuity.";
   const stormBlocking=stormAction?" Stage the wind and lightning around established actors without changing their identities or costume; keep storm direction consistent across cuts.":"";
   const blockingNotes=(shot.motionScript?shot.motionScript+" ":"")+geography+stormBlocking;
   const reason=stormAction?"Storm sequence: frame weather scale and maintain storm direction between shots.":actionBeat?"Action beat: establish impact and readable movement.":emotionalBeat?"Character beat: emphasise expression and reaction.":"Storyboard-based composition; human editorial review required.";
   proposals.push({shotId:shot.id,sceneId:scene.id,cameraDirection,blockingNotes,transitionIn:i===0?"cut":shot.transitionIn||"cut",transitionOut:shot.transitionOut||"cut",reason});
  }
 }
 if(proposals.length!==shotRows.length)return NextResponse.json({error:"Some shots are not assigned to an episode scene"},{status:409});
 const [draft]=await db.insert(blackfistDirectorDrafts).values({id:randomUUID(),projectId:id,episodeId,proposalsJson:JSON.stringify(proposals),status:"draft_review_required"}).returning({id:blackfistDirectorDrafts.id});
 return NextResponse.json({draftId:draft.id,episodeId,status:"draft_review_required",proposals,storyboardChanged:false,paidGenerationStarted:false});
}
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const drafts=await db.select().from(blackfistDirectorDrafts).where(and(eq(blackfistDirectorDrafts.projectId,id),eq(blackfistDirectorDrafts.episodeId,episodeId))).orderBy(desc(blackfistDirectorDrafts.createdAt)).limit(20);
 return NextResponse.json({episodeId,drafts:drafts.map(d=>({id:d.id,status:d.status,createdAt:d.createdAt,proposals:JSON.parse(d.proposalsJson) as Proposal[]}))});
}
