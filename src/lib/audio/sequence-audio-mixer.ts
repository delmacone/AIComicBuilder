import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

const uploadDir=process.env.UPLOAD_DIR||"./uploads";
export type SequenceMixInput={fileUrl:string;kind:"dialogue"|"ambience"|"sfx"|"music";startSeconds:number;volume?:number;endSeconds?:number};

function resolveUploadUrl(url:string){
 const prefix="/api/uploads/";if(!url.startsWith(prefix))throw new Error("Sequence audio asset is not a local upload");
 const relative=url.slice(prefix.length).split("/").filter(Boolean);
 const full=path.resolve(uploadDir,...relative),root=path.resolve(uploadDir);
 if(!full.startsWith(root))throw new Error("Invalid sequence audio path");
 return full;
}

export async function mixSequenceAudio(inputs:SequenceMixInput[],durationSeconds:number,options?:{duckMusicUnderDialogue?:boolean}){
 if(!inputs.length)throw new Error("No audio assets to mix");
 const outDir=path.resolve(uploadDir,"audio","blackfist-sequences","mixes");fs.mkdirSync(outDir,{recursive:true});
 const out=path.join(outDir,`${genId()}.mp3`);const cmd=ffmpeg();inputs.forEach(x=>cmd.input(resolveUploadUrl(x.fileUrl)));
 const filters:string[]=[];const labels:string[]=[];
 const dialogueWindows=inputs.filter(x=>x.kind==="dialogue").map(x=>({start:Math.max(0,x.startSeconds),end:Math.min(durationSeconds,x.endSeconds??x.startSeconds+10)})).filter(x=>x.end>x.start);
 const duckEnabled=options?.duckMusicUnderDialogue===true&&dialogueWindows.length>0;
 inputs.forEach((x,i)=>{const vol=x.volume??(x.kind==="dialogue"?1:x.kind==="sfx"?.85:.28);const delay=Math.max(0,Math.round(x.startSeconds*1000));const label=`a${i}`;const fade=duckEnabled&&x.kind==="music"?dialogueWindows.reduce((expr,w)=>`if(between(t,${w.start.toFixed(3)},${w.end.toFixed(3)}),0.3,${expr})`,"1"):"1";filters.push(`[${i}:a]adelay=${delay}|${delay},volume=${vol}${duckEnabled&&x.kind==="music"?`:eval=frame`:""}${duckEnabled&&x.kind==="music"?`,volume=\u0027${fade}\u0027:eval=frame`:""}[${label}]`);labels.push(`[${label}]`)});
 filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0,alimiter=limit=0.95[mix]`);
 await new Promise<void>((resolve,reject)=>cmd.complexFilter(filters,"mix").outputOptions(["-y","-t",String(durationSeconds),"-c:a","libmp3lame","-b:a","192k"]).output(out).on("end",()=>resolve()).on("error",e=>reject(new Error(`Sequence audio mix failed: ${e.message}`))).run());
 const rel=path.relative(uploadDir,out).split(path.sep).join("/");return {filePath:out,url:`/api/uploads/${rel}`};
}
