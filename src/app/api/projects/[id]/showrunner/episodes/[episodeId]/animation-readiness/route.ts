import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";
import { blackfistScreenplayDrafts, scenes, shots, dialogues, characters, episodeCharacters } from "@/lib/db/schema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
 const { id, episodeId } = await params;
 if (!(await assertProjectOwnership(request, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const [approved] = await db.select({ id: blackfistScreenplayDrafts.id }).from(blackfistScreenplayDrafts).where(and(eq(blackfistScreenplayDrafts.projectId,id),eq(blackfistScreenplayDrafts.episodeId,episodeId),eq(blackfistScreenplayDrafts.status,"approved"))).limit(1);
 const episodeScenes = await db.select().from(scenes).where(and(eq(scenes.projectId,id),eq(scenes.episodeId,episodeId)));
 const episodeShots = await db.select().from(shots).where(and(eq(shots.projectId,id),eq(shots.episodeId,episodeId)));
 const cast = await db.select({id:characters.id,name:characters.name,canonLockEnabled:characters.canonLockEnabled,voiceLockEnabled:characters.voiceLockEnabled,referenceImage:characters.referenceImage,elevenLabsVoiceId:characters.elevenLabsVoiceId}).from(episodeCharacters).innerJoin(characters,eq(episodeCharacters.characterId,characters.id)).where(and(eq(episodeCharacters.episodeId,episodeId),eq(characters.projectId,id)));
 const castIds = new Set(cast.map(c=>c.id));
 const sceneIds = new Set(episodeScenes.map(s=>s.id));
 const shotChecks = [];
 for(const shot of episodeShots){
  const lines = await db.select({characterId:dialogues.characterId}).from(dialogues).where(eq(dialogues.shotId,shot.id));
  const issues:string[] = [];
  if(!shot.sceneId||!sceneIds.has(shot.sceneId))issues.push("Shot is not linked to an approved episode scene");
  if(!shot.prompt?.trim())issues.push("Missing shot description");
  if(!shot.duration||shot.duration<1||shot.duration>30)issues.push("Shot duration outside supported 1–30 second range");
  if(shot.continuityStatus!=="passed")issues.push("Continuity review not passed");
  if(shot.isStale)issues.push("Shot marked stale");
  if(shot.status==="generating")issues.push("Shot generation already in progress");
  for(const line of lines)if(!castIds.has(line.characterId))issues.push("Dialogue references an actor not assigned to this episode");
  shotChecks.push({id:shot.id,sceneId:shot.sceneId,sequence:shot.sequence,status:shot.status,continuityStatus:shot.continuityStatus,ready:issues.length===0,issues});
 }
 const missing:string[]=[];
 if(!approved)missing.push("Approve a screenplay");
 if(!episodeScenes.length)missing.push("Create approved screenplay scenes");
 if(!episodeShots.length)missing.push("Create storyboard shots");
 if(!cast.length)missing.push("Assign episode actors");
 const blocked=shotChecks.filter(s=>!s.ready).length;
 return NextResponse.json({ready:missing.length===0&&blocked===0,missing,cast:cast.map(c=>({id:c.id,name:c.name,canonLockEnabled:!!c.canonLockEnabled,voiceLockEnabled:!!c.voiceLockEnabled,hasReferenceImage:!!c.referenceImage,hasVoice:!!c.elevenLabsVoiceId})),sceneCount:episodeScenes.length,shotCount:episodeShots.length,blockedShotCount:blocked,shots:shotChecks,videoGenerationStarted:false});
}
