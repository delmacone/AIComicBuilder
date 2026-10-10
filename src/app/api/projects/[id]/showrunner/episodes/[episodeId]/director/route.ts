import { NextResponse } from "next/server";
import { and,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { episodes,characters,episodeCharacters,projects } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function GET(request:Request,{params}:{params:Promise<{id:string;episodeId:string}>}){
 const {id,episodeId}=await params;
 const project=await assertProjectOwnership(request,id);
 if(!project)return NextResponse.json({error:"Not found"},{status:404});
 const [episode]=await db.select().from(episodes).where(and(eq(episodes.id,episodeId),eq(episodes.projectId,id)));
 if(!episode)return NextResponse.json({error:"Episode not found"},{status:404});
 const assigned=await db.select({character:characters}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const cast=assigned.map(({character:c})=>({id:c.id,name:c.name,description:c.description,referenceImage:c.referenceImage,canonLockEnabled:Boolean(c.canonLockEnabled),canonVisualLock:c.canonVisualLock,voiceLockEnabled:Boolean(c.voiceLockEnabled),voiceId:c.elevenLabsVoiceId}));
 const directorBrief={show:project.title,episode:episode.title,episodeNumber:episode.sequence,idea:episode.idea||"",outline:episode.outline||"",script:episode.script||"",targetDurationSeconds:episode.targetDuration||1320,cast,productionRules:["Use only assigned characters for speaking roles unless a new actor is explicitly approved.","Preserve locked character identity, costume and voice.","Plan scenes and shots before requesting paid video generation.","Require human review of screenplay, casting, shots and final episode."]};
 return NextResponse.json({directorBrief,ready:cast.length>0&&Boolean(episode.idea||episode.script),missing:[...(cast.length?[]:["Assign episode actors"]),...(episode.idea||episode.script?[]:["Add an episode story idea or script"])]});
}
