import {NextResponse} from "next/server";
import {buildReadinessSummary} from "@/lib/blackfist/readiness-summary";
import {checkAvDurationAlignment} from "@/lib/blackfist/av-duration-readiness";
import {and,eq,desc} from "drizzle-orm";
import {db} from "@/lib/db";
import {assertProjectOwnership} from "@/lib/assert-project-ownership";
import {episodes,blackfistScreenplayDrafts,scenes,shots,dialogues,blackfistEpisodeAssemblies,blackfistEpisodeSoundtracks,blackfistEpisodeReviewMasters,blackfistSequences,characters,episodeCharacters} from "@/lib/db/schema";

/** Read-only readiness gates. Never generates or approves media. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const [screenplay]=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 const sceneRows=await db.select({id:scenes.id}).from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId)));
 const shotRows=await db.select({id:shots.id,sceneId:shots.sceneId,status:shots.status,isStale:shots.isStale,continuityStatus:shots.continuityStatus,duration:shots.duration}).from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const dialogueRows=await db.select({id:dialogues.id,audioUrl:dialogues.audioUrl}).from(dialogues).innerJoin(shots,eq(dialogues.shotId,shots.id)).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const [video]=await db.select().from(blackfistEpisodeAssemblies).where(and(eq(blackfistEpisodeAssemblies.projectId,id),eq(blackfistEpisodeAssemblies.episodeId,episodeId))).orderBy(desc(blackfistEpisodeAssemblies.createdAt)).limit(1);
 const [soundtrack]=await db.select().from(blackfistEpisodeSoundtracks).where(and(eq(blackfistEpisodeSoundtracks.projectId,id),eq(blackfistEpisodeSoundtracks.episodeId,episodeId))).orderBy(desc(blackfistEpisodeSoundtracks.createdAt)).limit(1);
 const [master]=await db.select().from(blackfistEpisodeReviewMasters).where(and(eq(blackfistEpisodeReviewMasters.projectId,id),eq(blackfistEpisodeReviewMasters.episodeId,episodeId))).orderBy(desc(blackfistEpisodeReviewMasters.createdAt)).limit(1);
 const cast=await db.select({id:characters.id,voiceId:characters.elevenLabsVoiceId,voiceLocked:characters.voiceLockEnabled}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const castById=new Map(cast.map(c=>[c.id,c]));
 const episodeDialogues=await db.select({id:dialogues.id,characterId:dialogues.characterId,audioUrl:dialogues.audioUrl,text:dialogues.text}).from(dialogues).innerJoin(shots,eq(dialogues.shotId,shots.id)).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const sequenceRows=await db.select().from(blackfistSequences).where(and(eq(blackfistSequences.projectId,id),eq(blackfistSequences.episodeId,episodeId)));
 function humanApproved(raw:string){try{return (JSON.parse(raw) as {humanApproved?:unknown}).humanApproved===true}catch{return false}}
 const sequenceIssues=sceneRows.flatMap(scene=>{const approved=sequenceRows.filter(seq=>seq.sceneId===scene.id&&seq.avStatus==="approved"&&!!seq.finalVideoUrl&&humanApproved(seq.avQc));return approved.length===1?[]:["Scene "+scene.id+" needs exactly one human-approved final AV sequence (found "+approved.length+")"]});
 if(sequenceRows.some(seq=>!seq.sceneId||!sceneRows.some(scene=>scene.id===seq.sceneId)))sequenceIssues.push("Assign all episode sequences to valid scenes");
 const voiceIssues=episodeDialogues.flatMap(line=>{const issues:string[]=[];const actor=castById.get(line.characterId);if(!actor)issues.push("Assign actor for dialogue "+line.id);else if(!actor.voiceLocked||!actor.voiceId)issues.push("Approve and lock voice for dialogue "+line.id);if(!line.audioUrl)issues.push("Render dialogue audio "+line.id);if(!line.text.trim())issues.push("Add text to dialogue "+line.id);return issues});
 const sceneIds=new Set(sceneRows.map(s=>s.id));
 const plannedSeconds=shotRows.reduce((sum,s)=>sum+(s.duration||0),0);
 const stages=[
  {key:"screenplay",title:"Approved screenplay",issues:screenplay?[]:["Approve an episode screenplay"]},
  {key:"storyboard",title:"Scenes and storyboard",issues:[...(!sceneRows.length?["Create episode scenes"]:[]),...(!shotRows.length?["Create storyboard shots"]:[]),...shotRows.filter(s=>!s.sceneId||!sceneIds.has(s.sceneId)).map(s=>"Assign shot "+s.id+" to a scene")]},
  {key:"animation",title:"Animation and continuity",issues:shotRows.length?shotRows.filter(s=>s.status!=="completed"||s.isStale||s.continuityStatus!=="passed").map(s=>"Render or approve shot "+s.id):["Storyboard shots required"]},
  {key:"voices",title:"Voice recordings",issues:voiceIssues},
  {key:"soundtrack",title:"Episode soundtrack",issues:soundtrack?[]:["Mix and save episode soundtrack"]},
  {key:"video",title:"Episode video",issues:[...sequenceIssues,...(video?[]:["Assemble and save episode video"])]},
  {key:"alignment",title:"Final audio/video timing",issues:!video||!soundtrack?["Video and soundtrack required"]:checkAvDurationAlignment(video.durationSeconds,soundtrack.durationSeconds)},
  {key:"runtime",title:"20–22 minute runtime",issues:plannedSeconds>=1200&&plannedSeconds<=1320?[]:["Storyboard runtime is "+plannedSeconds+" seconds; target is 1200–1320"]},
  {key:"reviewMaster",title:"Unpublished review MP4",issues:master?[]:["Create unpublished review MP4 after editorial approval"]},
 ];
 const summary=buildReadinessSummary(stages);
 return NextResponse.json({...summary,episodeId,plannedSeconds,sceneCount:sceneRows.length,shotCount:shotRows.length,dialogueCount:dialogueRows.length,mediaGenerated:false});
}
