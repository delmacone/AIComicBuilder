const BASE="https://api.dev.runwayml.com/v1";
function headers(){const key=process.env.RUNWAYML_API_SECRET;if(!key)throw new Error("RUNWAYML_API_SECRET is not configured");return {"Authorization":`Bearer ${key}`,"X-Runway-Version":"2024-11-06","Content-Type":"application/json"}}
export type RunwayMultiShot={prompt:string;duration:number};
export async function createRunwayMultiShot(input:{shots:RunwayMultiShot[];duration:5|10|15;ratio?:"1280:720"|"1920:1080";firstFrame?:string}){
 const body:Record<string,unknown>={version:"2026-06",mode:"custom",shots:input.shots,duration:input.duration,ratio:input.ratio||"1280:720",audio:false};
 if(input.firstFrame)body.firstFrame={uri:input.firstFrame};
 const r=await fetch(`${BASE}/recipes/multi_shot_video`,{method:"POST",headers:headers(),body:JSON.stringify(body)});if(!r.ok)throw new Error(`Runway Multi-Shot failed (${r.status}): ${await r.text()}`);return await r.json() as {id:string};
}
export async function getRunwayTask(id:string){const r=await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`,{headers:headers()});if(!r.ok)throw new Error(`Runway task lookup failed (${r.status})`);return await r.json() as {id:string;status:string;output?:string[];failure?:string;failureCode?:string};}
