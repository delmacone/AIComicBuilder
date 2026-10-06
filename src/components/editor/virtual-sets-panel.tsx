"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { Film, Plus } from "lucide-react";

type VirtualSet = {
  id: string; name: string; location?: string | null; timeOfDay?: string | null;
  weather?: string | null; lighting?: string | null; continuityLockEnabled?: boolean;
};

export function VirtualSetsPanel({ projectId }: { projectId: string }) {
  const [sets, setSets] = useState<VirtualSet[]>([]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await apiFetch(`/api/projects/${projectId}/virtual-sets`);
    if (res.ok) setSets((await res.json()).sets ?? []);
  }
  useEffect(() => { void load(); }, [projectId]);

  async function createSet() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/virtual-sets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not create set");
      setName(""); setLocation(""); await load(); toast.success("Virtual Set created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create set"); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border p-4 space-y-3">
    <div className="flex items-center gap-2"><Film className="h-4 w-4" /><h3 className="font-semibold">Virtual Film Sets</h3></div>
    <p className="text-xs text-muted-foreground">Reusable locked locations keep architecture, geography, props and damage consistent across shots.</p>
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
      <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Set name — Tower Bridge" value={name} onChange={e=>setName(e.target.value)} />
      <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Location — London, England" value={location} onChange={e=>setLocation(e.target.value)} />
      <Button onClick={createSet} disabled={busy || !name.trim()}><Plus className="mr-1 h-4 w-4" />Create Set</Button>
    </div>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {sets.map(set => <div key={set.id} className="rounded-lg border p-3 text-sm">
        <div className="font-medium">{set.name}</div><div className="text-xs text-muted-foreground">{set.location || "Location not set"}</div>
        <div className="mt-2 text-[11px]">{set.continuityLockEnabled === false ? "Unlocked" : "Continuity locked"}</div>
      </div>)}
      {!sets.length && <div className="text-xs text-muted-foreground">No Virtual Sets yet.</div>}
    </div>
  </section>;
}
