import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "./uploads");

function local(url: string): string {
 const prefix = "/api/uploads/";
 if (!url.startsWith(prefix)) throw new Error("Approved sequence is not stored locally");
 const relative = url.slice(prefix.length);
 if (!relative || relative.includes("\\") || relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid sequence path");
 const file = path.resolve(uploadRoot, relative);
 if (!file.startsWith(uploadRoot + path.sep)) throw new Error("Sequence path outside uploads");
 if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("Approved sequence file missing");
 const rootReal = fs.realpathSync(uploadRoot);
 if (!fs.realpathSync(file).startsWith(rootReal + path.sep)) throw new Error("Sequence symlink outside uploads");
 return file;
}

type ClipProbe = { duration: number; codec: string; width: number; height: number; frameRate: string };
function probe(file: string): Promise<ClipProbe> {
 return new Promise((resolve, reject) => ffmpeg.ffprobe(file, (error, data) => {
  if (error) return reject(error);
  const video = data.streams.find(stream => stream.codec_type === "video");
  if (!video) return reject(new Error("Approved sequence lacks a video stream"));
  const duration = Number(data.format.duration);
  const width = Number(video.width), height = Number(video.height);
  if (!Number.isFinite(duration) || duration <= 0 || !width || !height) return reject(new Error("Invalid sequence video metadata"));
  resolve({ duration, codec: String(video.codec_name || ""), width, height, frameRate: String(video.r_frame_rate || "") });
 }));
}

/** Join every approved scene clip in order; reject missing or incompatible media instead of silently dropping it. */
export async function assembleApprovedSequences(urls: string[], projectId: string) {
 if (!urls.length) throw new Error("No approved sequences");
 if (urls.some(url => !url)) throw new Error("Every approved sequence must have a video URL");
 const files = urls.map(local);
 const metadata = await Promise.all(files.map(probe));
 const first = metadata[0];
 for (const [index, clip] of metadata.entries()) {
  if (clip.codec !== first.codec || clip.width !== first.width || clip.height !== first.height || clip.frameRate !== first.frameRate) {
   throw new Error(`Sequence ${index + 1} is incompatible with the first clip; standardise codec, resolution and frame rate before assembly`);
  }
 }
 const expectedDurationSeconds = metadata.reduce((total, clip) => total + clip.duration, 0);
 const dir = path.resolve(uploadRoot, "videos", "blackfist-episodes");
 fs.mkdirSync(dir, { recursive: true });
 const list = path.join(dir, `${genId()}.txt`);
 const output = path.join(dir, `${projectId}-episode-${genId()}.mp4`);
 fs.writeFileSync(list, files.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
 try {
  await new Promise<void>((resolve, reject) => ffmpeg().input(list).inputOptions(["-f", "concat", "-safe", "0"]).outputOptions(["-y", "-c", "copy"]).output(output).on("end", () => resolve()).on("error", (error: Error) => reject(error)).run());
  const result = await probe(output);
  if (Math.abs(result.duration - expectedDurationSeconds) > Math.max(0.25, metadata.length * 0.08)) throw new Error(`Assembled video duration ${result.duration.toFixed(2)}s does not match expected ${expectedDurationSeconds.toFixed(2)}s`);
  const relative = path.relative(uploadRoot, output).split(path.sep).join("/");
  return { filePath: output, url: `/api/uploads/${relative}`, durationSeconds: result.duration, sequenceCount: files.length };
 } catch (error) {
  try { fs.unlinkSync(output); } catch {}
  throw error;
 } finally {
  try { fs.unlinkSync(list); } catch {}
 }
}
