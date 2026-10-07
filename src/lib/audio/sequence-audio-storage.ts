import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

const uploadDir=process.env.UPLOAD_DIR||"./uploads";

export function saveSequenceAudio(bytes:Uint8Array,extension="mp3"){
 const filename=`${genId()}.${extension.replace(/[^a-z0-9]/gi,"").toLowerCase()||"mp3"}`;
 const relative=path.join("audio","blackfist-sequences",filename);
 const full=path.join(uploadDir,relative);
 fs.mkdirSync(path.dirname(full),{recursive:true});
 fs.writeFileSync(full,Buffer.from(bytes));
 return {filePath:full,url:`/api/uploads/${relative.split(path.sep).join("/")}`};
}
