import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blackfistScreenplayDrafts, scenes, shots, dialogues, episodeCharacters, characters } from "@/lib/db/schema";

/** A fail-closed gate for paid video rendering of Showrunner-approved episodes.
 * Non-Showrunner projects are unaffected. */
export async function checkShowrunnerVideoGate(projectId:string, candidateShots:Array<{id:string;episodeId:string|null;sceneId:string|null;continuityStatus:string;isStale:number;prompt:string|null;duration:number}>) {
 const issues:string[]=[];
 const byEpisode=new Map<string,typeof candidateShots>();
 for(const shot of candidateShots){if(!shot.episodeId)continue;const group=byEpisode.get(shot.episodeId)||[];group.push(shot);byEpisode.set(shot.episodeId,group)}
 for(const [episodeId,group] of byEpisode){
  const approved=await db.select({id:blackfistScreenplayDrafts.id}).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,projectId),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
  if(!approved.length)continue;
  const validScenes=await db.select({id:scenes.id}).from(scenes).where(and(eq(scenes.projectId,projectId),eq(scenes.episodeId,episodeId)));
  const validSceneIds=new Set(validScenes.map(x=>x.id));
  const assigned=await db.select({id:characters.id}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,projectId)));
  const castIds=new Set(assigned.map(x=>x.id));
  for(const shot of group){
   if(!shot.sceneId||!validSceneIds.has(shot.sceneId))issues.push(shot.id+": invalid episode scene");
   if(shot.continuityStatus!=="passed"||shot.isStale)issues.push(shot.id+": continuity not approved or shot stale");
   if(!shot.prompt?.trim()||shot.duration<1||shot.duration>30)issues.push(shot.id+": invalid prompt or duration");
   const lines=await db.select({characterId:dialogues.characterId}).from(dialogues).where(eq(dialogues.shotId,shot.id));
   if(lines.some(x=>!castIds.has(x.characterId)))issues.push(shot.id+": dialogue cast is not approved");
  }
 }
 return issues;
}
