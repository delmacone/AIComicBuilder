import ffmpeg from "fluent-ffmpeg";
import path from "node:path";
import fs from "node:fs";

/** Only probe files served from our own upload directory. Never fetch arbitrary URLs. */
export function resolveLocalDialogueAudio(url:string){
 const prefix="/api/uploads/";
 if(!url.startsWith(prefix))throw new Error("Dialogue audio must be a local upload");
 const relative=url.slice(prefix.length).split("/").filter(Boolean);
 if(!relative.length||relative.some(p=>p==="."||p===".."))throw new Error("Invalid dialogue audio path");
 const root=path.resolve(process.env.UPLOAD_DIR||"./uploads");
 const full=path.resolve(root,...relative);
 if(!full.startsWith(root+path.sep))throw new Error("Dialogue audio outside upload directory");
 if(!fs.existsSync(full))throw new Error("Dialogue audio file missing");
 return full;
}
export async function probeDialogueSeconds(url:string):Promise<number>{
 const file=resolveLocalDialogueAudio(url);
 return await new Promise<number>((resolve,reject)=>{
  ffmpeg.ffprobe(file,(err,data)=>{
   if(err)return reject(err);
   const seconds=Number(data.format.duration);
   if(!Number.isFinite(seconds)||seconds<=0)return reject(new Error("Unable to determine speech duration"));
   resolve(seconds);
  });
 });
}
