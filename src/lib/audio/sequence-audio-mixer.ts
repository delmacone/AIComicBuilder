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
 if(full===root||!full.startsWith(root+path.sep))throw new Error("Invalid sequence audio path");
 return full;
}

/** Smooth, merged dialogue windows; ramp down before speech and back up afterwards. */
export function musicDuckingExpression(windows:Array<{start:number;end:number}>,fadeSeconds=0.35){
 const valid=windows.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start).sort((a,b)=>a.start-b.start);
 const merged:Array<{start:number;end:number}>=[];
 for(const w of valid){const last=merged[merged.length-1];if(last&&w.start<=last.end+2*fadeSeconds)last.end=Math.max(last.end,w.end);else merged.push({...w})}
 let expr="1";
 for(const w of merged){
  const start=Math.max(0,w.start-fadeSeconds),down=Math.max(0,w.start-start),up=fadeSeconds;
  const downExpr=down>0?`(1-0.7*(t-${start.toFixed(3)})/${down.toFixed(3)})`:"0.3";
  const upExpr=`(0.3+0.7*(t-${w.end.toFixed(3)})/${up.toFixed(3)})`;
  expr=`if(between(t\\,${start.toFixed(3)}\\,${w.start.toFixed(3)})\\,${downExpr}\\,if(between(t\\,${w.start.toFixed(3)}\\,${w.end.toFixed(3)})\\,0.3\\,if(between(t\\,${w.end.toFixed(3)}\\,${(w.end+up).toFixed(3)})\\,${upExpr}\\,${expr})))`;
 }
 return expr;
}

export async function mixSequenceAudio(inputs:SequenceMixInput[],durationSeconds:number,options?:{duckMusicUnderDialogue?:boolean}){
 if(!inputs.length)throw new Error("No audio assets to mix");
 const outDir=path.resolve(uploadDir,"audio","blackfist-sequences","mixes");fs.mkdirSync(outDir,{recursive:true});
 const out=path.join(outDir,`${genId()}.mp3`);const cmd=ffmpeg();inputs.forEach(x=>cmd.input(resolveUploadUrl(x.fileUrl)));
 const filters:string[]=[];const labels:string[]=[];
 const dialogueWindows=inputs.filter(x=>x.kind==="dialogue").map(x=>({start:Math.max(0,x.startSeconds),end:Math.min(durationSeconds,x.endSeconds??x.startSeconds+10)})).filter(x=>x.end>x.start);
 const duckEnabled=options?.duckMusicUnderDialogue===true&&dialogueWindows.length>0;
 inputs.forEach((x,i)=>{
  const vol=x.volume??(x.kind==="dialogue"?1:x.kind==="sfx"?.85:.28);
  const delay=Math.max(0,Math.round(x.startSeconds*1000));
  const label=`a${i}`;
  let filter=`[${i}:a]adelay=${delay}|${delay},volume=${vol}`;
  if(duckEnabled&&x.kind==="music"){
   const expression=musicDuckingExpression(dialogueWindows);
   filter+=`,volume='${expression}':eval=frame`;
  }
  filters.push(`${filter}[${label}]`);
  labels.push(`[${label}]`);
 });
 filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0,alimiter=limit=0.95[mix]`);
 await new Promise<void>((resolve,reject)=>cmd.complexFilter(filters,"mix").outputOptions(["-y","-t",String(durationSeconds),"-c:a","libmp3lame","-b:a","192k"]).output(out).on("end",()=>resolve()).on("error",e=>reject(new Error(`Sequence audio mix failed: ${e.message}`))).run());
 const rel=path.relative(uploadDir,out).split(path.sep).join("/");return {filePath:out,url:`/api/uploads/${rel}`};
}
