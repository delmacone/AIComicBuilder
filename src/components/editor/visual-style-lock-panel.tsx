"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { Palette, Lock, Unlock } from "lucide-react";

const styles = [
  ["blackfist_comic_shader", "BlackFist Comic Shader"],
  ["cinematic_3d", "Cinematic 3D"],
  ["ultra_realistic", "Ultra-Realistic"],
  ["graphic_novel", "Graphic Novel"],
  ["kids_animation", "Kids Animation"],
] as const;

export function VisualStyleLockPanel({ project, onUpdated }: { project: { id:string; visualStylePreset?:string; visualStyleLockEnabled?:number; visualStyleLockVersion?:number }; onUpdated?:()=>void }) {
  const [preset,setPreset]=useState(project.visualStylePreset || "blackfist_comic_shader"); const [busy,setBusy]=useState(false);
  const locked=project.visualStyleLockEnabled !== 0;
  async function save(nextLocked=locked) {
    setBusy(true);
    try {
      const res=await apiFetch(`/api/projects/${project.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({visualStylePreset:preset,visualStyleLockEnabled:nextLocked?1:0})});
      if(!res.ok) throw new Error("Could not update Visual Style Lock");
      toast.success(nextLocked ? "Visual Style locked for production" : "Visual Style unlocked"); onUpdated?.();
    } catch(e){toast.error(e instanceof Error?e.message:"Could not update style");} finally{setBusy(false);}
  }
  return <section className="rounded-xl border p-4 space-y-3">
    <div className="flex items-center gap-2"><Palette className="h-4 w-4"/><h3 className="font-semibold">Visual Style Lock</h3><span className="text-[11px] text-muted-foreground">v{project.visualStyleLockVersion||1}</span></div>
    <p className="text-xs text-muted-foreground">Locks the rendering language across characters, sets and shots without changing story canon.</p>
    <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
      <select className="rounded-md border bg-background px-3 py-2 text-sm" value={preset} onChange={e=>setPreset(e.target.value)}>{styles.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <Button disabled={busy} onClick={()=>void save(locked)}>Save Style</Button>
      <Button disabled={busy} variant={locked?"default":"outline"} onClick={()=>void save(!locked)}>{locked?<><Lock className="mr-1 h-4 w-4"/>Locked</>:<><Unlock className="mr-1 h-4 w-4"/>Unlocked</>}</Button>
    </div>
    <div className="text-[11px]">{locked ? "Mandatory across production generation." : "Unlocked: providers may vary rendering style."}</div>
  </section>;
}
