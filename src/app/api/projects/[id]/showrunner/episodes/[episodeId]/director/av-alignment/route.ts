import {NextResponse} from "next/server";
import {and,desc,eq} from "drizzle-orm";
import {db} from "@/lib/db";
import {assertProjectOwnership} from "@/lib/assert-project-ownership";
import {episodes,blackfistEpisodeAssemblies,blackfistEpisodeSoundtracks} from "@/lib/db/schema";

/** Compare persisted, episode-owned video and soundtrack masters before editorial mux. */
export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 if(!(await assertProjectOwnership(request,id)))return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select({id:episodes.id,targetDuration:episodes.targetDuration}).from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id))).limit(1);
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const [video]=await db.select().from(blackfistEpisodeAssemblies).where(and(eq(blackfistEpisodeAssemblies.projectId,id),eq(blackfistEpisodeAssemblies.episodeId,episodeId))).orderBy(desc(blackfistEpisodeAssemblies.createdAt)).limit(1);
 const [audio]=await db.select().from(blackfistEpisodeSoundtracks).where(and(eq(blackfistEpisodeSoundtracks.projectId,id),eq(blackfistEpisodeSoundtracks.episodeId,episodeId))).orderBy(desc(blackfistEpisodeSoundtracks.createdAt)).limit(1);
 const issues:string[]=[];
 if(!video)issues.push("No assembled episode video saved");
 if(!audio)issues.push("No mixed episode soundtrack saved");
 const videoSeconds=video?.durationSeconds??null;
 const soundtrackSeconds=audio?.durationSeconds??null;
 const driftSeconds=videoSeconds!==null&&soundtrackSeconds!==null?Math.round((soundtrackSeconds-videoSeconds)*100)/100:null;
 if(driftSeconds!==null&&Math.abs(driftSeconds)>0.25)issues.push(driftSeconds>0?"Soundtrack extends beyond video by "+driftSeconds.toFixed(2)+" seconds":"Video extends beyond soundtrack by "+Math.abs(driftSeconds).toFixed(2)+" seconds");
 if(videoSeconds!==null&&(videoSeconds<1200||videoSeconds>1320))issues.push("Assembled video outside the 20–22 minute production band");
 const target=episode.targetDuration||1320;
 if(videoSeconds!==null&&Math.abs(videoSeconds-target)>60)issues.push("Assembled video differs from episode target by more than 60 seconds");
 return NextResponse.json({episodeId,video:video?{id:video.id,fileUrl:video.fileUrl,durationSeconds:videoSeconds,sceneCount:video.sceneCount,status:video.status}:null,soundtrack:audio?{id:audio.id,fileUrl:audio.fileUrl,durationSeconds:soundtrackSeconds,status:audio.status}:null,targetDurationSeconds:target,driftSeconds,readyForEditorialMux:issues.length===0,issues,measurement:"Persisted assembly and soundtrack durations; not frame-by-frame gap or overlap analysis",mediaGenerated:false});
}
