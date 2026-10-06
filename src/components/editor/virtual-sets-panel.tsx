"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { Film, Plus, Save, Lock, Unlock } from "lucide-react";

type VirtualSet = {
  id: string; name: string; description?: string | null; location?: string | null;
  timeOfDay?: string | null; weather?: string | null; lighting?: string | null;
  layoutState?: string | null; propsState?: string | null; damageState?: string | null;
  continuityLockEnabled?: boolean | number; continuityLockVersion?: number;
};

export function VirtualSetsPanel({ projectId, scenes = [], onAssigned }: { projectId: string; scenes?: Array<{ id: string; title: string; virtualSetId?: string | null }>; onAssigned?: () => void }) {
  const [sets, setSets] = useState<VirtualSet[]>([]);
  const [name, setName] = useState(""); const [location, setLocation] = useState("");
  const [editing, setEditing] = useState<VirtualSet | null>(null); const [busy, setBusy] = useState(false);

  async function load() { const res = await apiFetch(`/api/projects/${projectId}/virtual-sets`); if (res.ok) setSets((await res.json()).sets ?? []); }
  useEffect(() => { void load(); }, [projectId]);

  async function assign(sceneId: string, virtualSetId: string) {
    const res = await apiFetch(`/api/projects/${projectId}/scenes/${sceneId}/virtual-set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ virtualSetId: virtualSetId || null }) });
    if (!res.ok) return toast.error("Could not assign Virtual Set"); toast.success("Scene set updated"); onAssigned?.();
  }
  async function createSet() {
    if (!name.trim()) return; setBusy(true);
    try { const res = await apiFetch(`/api/projects/${projectId}/virtual-sets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, location }) });
      if (!res.ok) throw new Error((await res.json()).error || "Could not create set"); setName(""); setLocation(""); await load(); toast.success("Virtual Set created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create set"); } finally { setBusy(false); }
  }
  async function saveSet() {
    if (!editing) return; setBusy(true);
    try { const res = await apiFetch(`/api/projects/${projectId}/virtual-sets/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error("Could not save Virtual Set"); await load(); toast.success("Virtual Set production state saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save Virtual Set"); } finally { setBusy(false); }
  }
  function field(key: keyof VirtualSet, placeholder: string) {
    return <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder={placeholder} value={String(editing?.[key] ?? "")} onChange={e=>setEditing(v=>v ? {...v,[key]:e.target.value}:v)} />;
  }

  return <section className="rounded-xl border p-4 space-y-4">
    <div className="flex items-center gap-2"><Film className="h-4 w-4" /><h3 className="font-semibold">Virtual Film Sets</h3></div>
    <p className="text-xs text-muted-foreground">Digital backlot locations remember geography, architecture, lighting, props and accumulated damage across shots.</p>
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
      <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Set name — Tower Bridge" value={name} onChange={e=>setName(e.target.value)} />
      <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Location — London, England" value={location} onChange={e=>setLocation(e.target.value)} />
      <Button onClick={createSet} disabled={busy || !name.trim()}><Plus className="mr-1 h-4 w-4" />Create Set</Button>
    </div>
    {scenes.length > 0 && <div className="space-y-2"><div className="text-xs font-medium">Scene assignments</div>{scenes.map(scene => <div key={scene.id} className="grid grid-cols-2 items-center gap-2 text-sm"><span>{scene.title || "Untitled scene"}</span><select className="rounded-md border bg-background px-2 py-1.5" value={scene.virtualSetId || ""} onChange={e=>void assign(scene.id,e.target.value)}><option value="">No Virtual Set</option>{sets.map(set=><option key={set.id} value={set.id}>{set.name}{set.location ? ` — ${set.location}` : ""}</option>)}</select></div>)}</div>}
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{sets.map(set=><button key={set.id} onClick={()=>setEditing(set)} className="rounded-lg border p-3 text-left text-sm hover:bg-muted/40"><div className="font-medium">{set.name}</div><div className="text-xs text-muted-foreground">{set.location || "Location not set"}</div><div className="mt-2 flex items-center gap-1 text-[11px]">{set.continuityLockEnabled === 0 ? <Unlock className="h-3 w-3"/>:<Lock className="h-3 w-3"/>}{set.continuityLockEnabled === 0 ? "Unlocked" : `Continuity locked v${set.continuityLockVersion || 1}`}</div></button>)}</div>
    {editing && <div className="rounded-xl border p-4 space-y-3"><div className="font-medium">Set Production State — {editing.name}</div>
      <div className="grid gap-2 md:grid-cols-2">{field("description","Set design / architecture")}{field("location","Location")}{field("timeOfDay","Time of day")}{field("weather","Weather")}{field("lighting","Lighting")}{field("layoutState",'Layout state JSON — {"road":"intact"}')}{field("propsState",'Props state JSON — {"lampPosts":"intact"}')}{field("damageState",'Damage state JSON — {"barrier":"broken"}')}</div>
      <div className="flex gap-2"><Button onClick={saveSet} disabled={busy}><Save className="mr-1 h-4 w-4"/>Save Set State</Button><Button variant="outline" onClick={()=>setEditing(null)}>Close</Button></div>
    </div>}
  </section>;
}
