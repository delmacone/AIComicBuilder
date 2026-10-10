"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { History, Plus } from "lucide-react";

export function SceneEventMemory({ projectId, scene, onUpdated }: { projectId: string; scene: { id: string; title: string; continuityState?: string | null; continuityStateVersion?: number }; onUpdated?: () => void }) {
  const [target, setTarget] = useState(""); const [change, setChange] = useState(""); const [busy, setBusy] = useState(false); const [suggestions, setSuggestions] = useState<Array<{type?:string;target:string;change:string;shotId?:string;characterId?:string;characterName?:string;state?:Record<string,unknown>}>>([]);
  let state: Record<string, unknown> = {}; try { state = JSON.parse(scene.continuityState || "{}"); } catch {}
  const changes = state.persistentChanges && typeof state.persistentChanges === "object" ? state.persistentChanges as Record<string, unknown> : {};

  async function detectEvents() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/lioncore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect_scene_events", sceneId: scene.id }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Lioncore could not inspect scene events");
      setSuggestions(data.events || []); toast.success(data.reply || "Scene inspected");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not inspect scene"); } finally { setBusy(false); }
  }
  async function applySuggestions() {
    if (!suggestions.length || !confirm(`Apply ${suggestions.length} Lioncore continuity event(s) to Scene Memory?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/lioncore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_scene_events", sceneId: scene.id, confirm: true, events: suggestions }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not apply events");
      setSuggestions([]); toast.success(data.reply); onUpdated?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply events"); } finally { setBusy(false); }
  }

  async function record() {
    if (!target.trim() || !change.trim()) return; setBusy(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/scenes/${scene.id}/continuity-state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: { type: "production_event", target: target.trim(), change: change.trim() } }) });
      if (!res.ok) throw new Error((await res.json()).error || "Could not record scene event");
      setTarget(""); setChange(""); toast.success("Scene event locked into continuity"); onUpdated?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record scene event"); } finally { setBusy(false); }
  }

  return <div className="rounded-lg border p-3 space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4"/>Scene Memory — {scene.title || "Untitled scene"} <span className="text-[10px] text-muted-foreground">v{scene.continuityStateVersion || 1}</span></div>
    {Object.keys(changes).length > 0 && <div className="grid gap-1 text-xs">{Object.entries(changes).map(([key,value])=><div key={key} className="rounded bg-muted/40 px-2 py-1"><b>{key}:</b> {String(value)}</div>)}</div>}
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={detectEvents}>Lioncore Detect Events</Button>{suggestions.length > 0 && <Button size="sm" disabled={busy} onClick={applySuggestions}>Apply {suggestions.length} Suggested Event{suggestions.length === 1 ? "" : "s"}</Button>}</div>{suggestions.length > 0 && <div className="space-y-1 text-xs">{suggestions.map((event,index)=><div key={index} className="rounded border px-2 py-1"><b>{event.type==="character_state" ? (event.characterName || event.target) : event.target}</b> → {event.change}{event.state&&<div className="text-muted-foreground">{JSON.stringify(event.state)}</div>}</div>)}</div>}<div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]"><input className="rounded-md border bg-background px-2 py-1.5 text-sm" placeholder="Target — road barrier" value={target} onChange={e=>setTarget(e.target.value)}/><input className="rounded-md border bg-background px-2 py-1.5 text-sm" placeholder="Persistent change — destroyed, debris on roadway" value={change} onChange={e=>setChange(e.target.value)}/><Button size="sm" disabled={busy||!target.trim()||!change.trim()} onClick={record}><Plus className="mr-1 h-3 w-3"/>Record Event</Button></div>
  </div>;
}
