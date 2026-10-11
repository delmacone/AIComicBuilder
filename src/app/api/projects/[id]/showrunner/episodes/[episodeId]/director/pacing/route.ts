import {probeDialogueSeconds} from "@/lib/audio/dialogue-duration";
import {NextResponse} from "next/server";
import {and,asc,eq} from "drizzle-orm";
import {db} from "@/lib/db";
import {assertProjectOwnership} from "@/lib/assert-project-ownership";
import {episodes,scenes,shots,dialogues} from "@/lib/db/schema";

/** Read-only editorial pacing review. No media rendering or paid AI requests. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id,title:episodes.title,targetDuration:episodes.targetDuration}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const sceneRows=await db.select({id:scenes.id,title:scenes.title,sequence:scenes.sequence}).from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId))).orderBy(asc(scenes.sequence));
 const shotRows=await db.select({id:shots.id,sceneId:shots.sceneId,sequence:shots.sequence,duration:shots.duration,prompt:shots.prompt}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId))).orderBy(asc(shots.sequence));
 const dialogueRows=await db.select({shotId:dialogues.shotId,text:dialogues.text,audioUrl:dialogues.audioUrl,startRatio:dialogues.startRatio,endRatio:dialogues.endRatio}).from(dialogues).innerJoin(shots,eq(dialogues.shotId,shots.id)).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const measured=await Promise.all(dialogueRows.map(async line=>{
  if(!line.audioUrl)return {...line,measuredSeconds:null as number|null,audioError:"Recording missing"};
  try{return {...line,measuredSeconds:await probeDialogueSeconds(line.audioUrl),audioError:null as string|null}}
  catch{return {...line,measuredSeconds:null as number|null,audioError:"Recording duration unavailable"}}
 }));
 const measuredByShot=new Map<string,typeof measured>();
 for(const line of measured)measuredByShot.set(line.shotId,[...(measuredByShot.get(line.shotId)||[]),line]);
 const target=episode.targetDuration||1320;
 const total=shotRows.reduce((sum,s)=>sum+Math.max(0,s.duration),0);
 const linesByShot=new Map<string,number>();
 for(const d of dialogueRows)linesByShot.set(d.shotId,(linesByShot.get(d.shotId)||0)+d.text.trim().split(/\s+/).filter(Boolean).length);
 const scenePacing=sceneRows.map(scene=>{
  const ss=shotRows.filter(s=>s.sceneId===scene.id);
  const durationSeconds=ss.reduce((sum,s)=>sum+Math.max(0,s.duration),0);
  const dialogueWords=ss.reduce((sum,s)=>sum+(linesByShot.get(s.id)||0),0);
  const estimatedDialogueSeconds=Math.round(dialogueWords/2.4);
  const actionShots=ss.filter(s=>/fight|attack|storm|lightning|chase|rescue|impact|battle|run/i.test(s.prompt||"")).length;
  const issues:string[]=[];
  const measuredDialogueSeconds=ss.reduce((sum,shot)=>sum+(measuredByShot.get(shot.id)||[]).reduce((subtotal,line)=>subtotal+(line.measuredSeconds||0),0),0);
  const missingRecordings=ss.reduce((sum,shot)=>sum+(measuredByShot.get(shot.id)||[]).filter(line=>line.measuredSeconds===null).length,0);
  const speechWindowIssues:string[]=[];
  for(const shot of ss){
   for(const line of measuredByShot.get(shot.id)||[]){
    const start=Number(line.startRatio??"0"),end=Number(line.endRatio??"1");
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1||start>=end){speechWindowIssues.push("Invalid dialogue timing window in shot "+shot.id);continue}
    if(line.measuredSeconds!==null&&line.measuredSeconds>(end-start)*shot.duration+0.05)speechWindowIssues.push("Recorded dialogue overruns shot "+shot.id);
   }
  }
  if(missingRecordings)issues.push(missingRecordings+" dialogue recordings missing or unmeasurable");
  issues.push(...speechWindowIssues);
  if(ss.length===0)issues.push("Scene has no storyboard shots");
  if(durationSeconds>0&&estimatedDialogueSeconds>durationSeconds)issues.push("Estimated dialogue exceeds planned scene runtime");
  if(durationSeconds>300)issues.push("Scene exceeds five minutes; consider an editorial pacing review");
  if(actionShots>0&&durationSeconds<actionShots*4)issues.push("Action beats may be too compressed");
  return {sceneId:scene.id,title:scene.title,shotCount:ss.length,durationSeconds,dialogueWords,estimatedDialogueSeconds,measuredDialogueSeconds:Math.round(measuredDialogueSeconds*10)/10,missingRecordings,actionShots,issues};
 });
 const issues:string[]=[];
 if(!shotRows.length)issues.push("No storyboard shots available");
 if(shotRows.some(s=>!s.sceneId||!sceneRows.some(scene=>scene.id===s.sceneId)))issues.push("Some shots are not assigned to episode scenes");
 if(total<1200)issues.push("Planned runtime is shorter than the 20-minute minimum");
 if(total>1320)issues.push("Planned runtime exceeds the 22-minute maximum");
 if(Math.abs(total-target)>60)issues.push("Planned runtime differs from episode target by more than one minute");
 if(scenePacing.some(s=>s.issues.length))issues.push("One or more scenes require pacing review");
 return NextResponse.json({episodeId,title:episode.title,targetDurationSeconds:target,plannedDurationSeconds:total,runtimeBandSeconds:{min:1200,max:1320},runtimeMinutes:Math.round(total/60*10)/10,readyForEditorialReview:shotRows.length>0,readyForProduction:issues.length===0,issues,scenes:scenePacing,estimatedDialogueMethod:"Approximation at 144 words per minute; measuredDialogueSeconds probes actual audio when present",recordedDialogueLines:measured.filter(line=>line.measuredSeconds!==null).length,totalDialogueLines:measured.length,paidAiRequestMade:false,mediaGenerated:false});
}
