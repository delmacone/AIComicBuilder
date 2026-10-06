"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-fetch";
import { Loader2, MessageCircle, X } from "lucide-react";

export function LioncorePanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const storageKey = `lioncore:${projectId}:conversation`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setReply(saved);
    } catch {}
  }, [storageKey]);

  async function runAction(action: "audit_continuity" | "scene_review" | "retry_shot", id?: string) {
    if (loading) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/lioncore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "scene_review" ? { action, sceneId: id } : action === "retry_shot" ? { action, shotId: id, confirm: true } : { action }),
      });
      const data = await response.json();
      const nextReply = response.ok ? data.reply : data.error || "Lioncore action failed.";
      setReply(nextReply);
      try { sessionStorage.setItem(storageKey, nextReply); } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function askLioncore() {
    if (!message.trim() || loading) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/lioncore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      const nextReply = response.ok ? data.reply : data.error || "Lioncore connection failed.";
      setReply(nextReply);
      if (response.ok) {
        try { sessionStorage.setItem(storageKey, nextReply); } catch {}
        setMessage("");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white shadow-xl"
      >
        <MessageCircle className="h-4 w-4" /> Ask Lioncore
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-white p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-display font-bold">Lioncore</div>
          <div className="text-[11px] text-muted-foreground">BlackFist Production Intelligence</div>
        </div>
        <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => runAction("audit_continuity")} disabled={loading}>
          Audit Continuity
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const sceneId = window.prompt("Scene ID to review");
            if (sceneId) runAction("scene_review", sceneId);
          }}
          disabled={loading}
        >
          Review Scene
        </Button>

      </div>
      {reply ? <div className="mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[--surface] p-3 text-sm">{reply}</div> : null}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask about canon, a scene, shot, costume, continuity or production..."
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askLioncore();
          }
        }}
        className="min-h-24"
      />
      <Button className="mt-2 w-full" onClick={askLioncore} disabled={loading || !message.trim()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {loading ? "Lioncore is thinking..." : "Ask Lioncore"}
      </Button>
    </div>
  );
}
