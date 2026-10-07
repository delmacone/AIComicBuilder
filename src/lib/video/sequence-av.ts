import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";
const uploadDir=process.env.UPLOAD_DIR||"./uploads";
function local(url:string){const p="/api/uploads/";if(url.startsWith(p)){const f=path.resolve(uploadDir,...url.slice(p.length).split("/"));if(!f.startsWith(path.resolve(uploadDir)))throw new Error("Invalid media path");return f}return path.resolve(url)}
export async function attachSequenceAudio(videoUrl:string,audioUrl:string){
 const video=local(videoUrl),audio=local(audioUrl);if(!fs.existsSync(video)||!fs.existsSync(audio))throw new Error("Sequence video or master audio is missing");
 const dir=path.resolve(uploadDir,"videos","blackfist-sequences");fs.mkdirSync(dir,{recursive:true});const out=path.join(dir,`${genId()}.mp4`);
 await new Promise<void>((resolve,reject)=>ffmpeg().input(video).input(audio).outputOptions(["-y","-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-shortest"]).output(out).on("end",()=>resolve()).on("error",e=>reject(new Error(`Sequence AV mux failed: ${e.message}`))).run());
 const rel=path.relative(uploadDir,out).split(path.sep).join("/");return {filePath:out,url:`/api/uploads/${rel}`};
}
