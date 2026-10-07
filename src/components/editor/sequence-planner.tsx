"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { Clapperboard } from "lucide-react";

export function SequencePlanner({projectId,scenes,onUpdated}:{projectId:string;scenes:Array<{id:string;title:string}>;onUpdated?:()=>void}) {
 const [sceneId,setSceneId]=useState(scenes[0]?.id||""); const [busy,setBusy]=useState(false);
 async function create(){if(!sceneId)return;setBusy(true);try{const r=await apiFetch(`/api/projects/${projectId}/sequences`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sceneId})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not create sequence");toast.success("BlackFist Multi-Shot sequence created");onUpdated?.();}catch(e){toast.error(e instanceof Error?e.message:"Could not create sequence");}finally{setBusy(false)}}
 return <section className="rounded-xl border p-4 space-y-3"><div className="flex items-center gap-2"><Clapperboard className="h-4 w-4"/><h3 className="font-semibold">BlackFist Sequence Planner</h3></div><p className="text-xs text-muted-foreground">Create a provider-independent 2–5 shot production block. Runway, OpenArt and future engines can execute the same locked plan.</p><div className="flex gap-2"><select className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={sceneId} onChange={e=>setSceneId(e.target.value)}>{scenes.map(s=><option key={s.id} value={s.id}>{s.title||"Untitled scene"}</option>)}</select><Button disabled={busy||!sceneId} onClick={create}>Create Multi-Shot Plan</Button></div></section>;
}
