import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

const uploadRoot=path.resolve(process.env.UPLOAD_DIR||"./uploads");
function approvedLocalFile(url:string){
 const prefix="/api/uploads/";
 if(!url.startsWith(prefix))throw new Error("Only local uploaded media is supported");
 const relative=url.slice(prefix.length);
 if(!relative||relative.includes("\\")||relative.split("/").some(x=>!x||x==="."||x===".."))throw new Error("Invalid media URL");
 const full=path.resolve(uploadRoot,relative);
 if(!full.startsWith(uploadRoot+path.sep))throw new Error("Media path outside upload directory");
 if(!fs.existsSync(full)||!fs.statSync(full).isFile())throw new Error("Approved media file not found");
 const real=fs.realpathSync(full);
 if(!real.startsWith(fs.realpathSync(uploadRoot)+path.sep))throw new Error("Media symlink outside upload directory");
 return full;
}
/** Combine an already-approved video edit with an editor-reviewed soundtrack. Does not publish. */
export async function muxReviewedEpisode(videoUrl:string,soundtrackUrl:string,projectId:string,episodeId:string){
 const video=approvedLocalFile(videoUrl),audio=approvedLocalFile(soundtrackUrl);
 const dir=path.join(uploadRoot,"videos","blackfist-episodes","review-masters");
 fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,`${projectId}-${episodeId}-${genId()}.mp4`);
 try{
  await new Promise<void>((resolve,reject)=>ffmpeg().input(video).input(audio)
   .outputOptions(["-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart","-y"])
   .output(output).on("end",()=>resolve()).on("error",(error:Error)=>reject(error)).run());
 }catch(error){try{fs.unlinkSync(output)}catch{}throw error}
 const relative=path.relative(uploadRoot,output).split(path.sep).join("/");
 return {fileUrl:`/api/uploads/${relative}`,status:"review_required" as const};
}
