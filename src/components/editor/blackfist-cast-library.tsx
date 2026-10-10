"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Actor = { id: string; name: string; sourceShow: string; referenceImage: string | null; canonLockEnabled: number; voiceLockEnabled: number };
export function BlackfistCastLibrary({ projectId }: { projectId: string }) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState<string[]>([]);
  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/projects/" + projectId + "/showrunner/library");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Library unavailable");
      setActors(data.characters || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Library unavailable"); }
    finally { setLoading(false); }
  }
  async function importActor(id: string) {
    setLoading(true);
    try {
      const response = await apiFetch("/api/projects/" + projectId + "/showrunner/library", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceCharacterId: id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");
      setImported((old) => [...old, id]);
      toast.success("Character imported into this show");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import failed"); }
    finally { setLoading(false); }
  }
  return <section className="rounded-xl border p-4 space-y-3">
    <h3 className="font-semibold">BlackFist Universe · Shared Actor Library</h3>
    <p className="text-sm text-muted-foreground">Reuse characters from your other shows. Import creates a separate copy of the approved character profile for this production.</p>
    <Button variant="outline" disabled={loading} onClick={load}>Browse My Actors</Button>
    {actors.map((actor) => <div key={actor.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
      <div className="flex items-center gap-3">
        {actor.referenceImage && <img src={actor.referenceImage} alt={actor.name} className="h-16 w-12 rounded object-contain" />}
        <div><div className="text-sm font-medium">{actor.name}</div><div className="text-xs text-muted-foreground">{actor.sourceShow} · {actor.canonLockEnabled ? "Canon locked" : "Canon unlocked"} · {actor.voiceLockEnabled ? "Voice locked" : "Voice unlocked"}</div></div>
      </div>
      <Button size="sm" disabled={loading || imported.includes(actor.id)} onClick={() => importActor(actor.id)}>{imported.includes(actor.id) ? "Imported" : "Import"}</Button>
    </div>)}
  </section>;
}
