import { NextResponse } from "next/server";
import { and,eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { assertProjectOwnership } from "@/lib/assert-project-ownership";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;characterId:string}>}){
 const {id:projectId,characterId}=await params;
 if(!(await assertProjectOwnership(request,projectId)))return NextResponse.json({error:"Not found"},{status:404});
 const [character]=await db.select().from(characters).where(and(eq(characters.id,characterId),eq(characters.projectId,projectId)));
 if(!character)return NextResponse.json({error:"Character not found"},{status:404});
 const body=await request.json() as {voiceId?:string;locked?:boolean};
 const voiceId=typeof body.voiceId==="string"?body.voiceId.trim():character.elevenLabsVoiceId;
 if(body.locked&&!voiceId)return NextResponse.json({error:"Assign an ElevenLabs voice before locking it"},{status:400});
 const changed=voiceId!==character.elevenLabsVoiceId||Boolean(body.locked)!==Boolean(character.voiceLockEnabled);
 const [updated]=await db.update(characters).set({elevenLabsVoiceId:voiceId||null,voiceLockEnabled:body.locked===undefined?character.voiceLockEnabled:(body.locked?1:0),voiceLockVersion:changed?character.voiceLockVersion+1:character.voiceLockVersion}).where(eq(characters.id,characterId)).returning();
 return NextResponse.json(updated);
}
