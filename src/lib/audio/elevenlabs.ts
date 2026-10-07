const BASE="https://api.elevenlabs.io/v1";
function key(){const k=process.env.ELEVENLABS_API_KEY;if(!k)throw new Error("ELEVENLABS_API_KEY is not configured");return k}
export async function generateElevenLabsSfx(input:{text:string;durationSeconds?:number;loop?:boolean}) {
 const r=await fetch(`${BASE}/sound-generation?output_format=mp3_44100_128`,{method:"POST",headers:{"xi-api-key":key(),"Content-Type":"application/json"},body:JSON.stringify({text:input.text,model_id:"eleven_text_to_sound_v2",loop:input.loop??false,duration_seconds:input.durationSeconds})});
 if(!r.ok)throw new Error(`ElevenLabs SFX failed (${r.status})`);
 return {bytes:new Uint8Array(await r.arrayBuffer()),contentType:r.headers.get("content-type")||"audio/mpeg",characterCost:r.headers.get("character-cost")};
}
export async function generateElevenLabsSpeech(input:{voiceId:string;text:string;modelId?:string}) {
 const r=await fetch(`${BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,{method:"POST",headers:{"xi-api-key":key(),"Content-Type":"application/json"},body:JSON.stringify({text:input.text,model_id:input.modelId||"eleven_multilingual_v2"})});
 if(!r.ok)throw new Error(`ElevenLabs TTS failed (${r.status})`);
 return {bytes:new Uint8Array(await r.arrayBuffer()),contentType:r.headers.get("content-type")||"audio/mpeg",characterCost:r.headers.get("character-cost")};
}
