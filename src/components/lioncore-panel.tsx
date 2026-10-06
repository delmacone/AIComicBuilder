"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-fetch";
import { Loader2, MessageCircle, X } from "lucide-react";

export function LioncorePanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

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
      setReply(response.ok ? data.reply : data.error || "Lioncore connection failed.");
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
      {reply ? <div className="mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[--surface] p-3 text-sm">{reply}</div> : null}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask about canon, a scene, shot, costume, continuity or production..."
        className="min-h-24"
      />
      <Button className="mt-2 w-full" onClick={askLioncore} disabled={loading || !message.trim()}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {loading ? "Lioncore is thinking..." : "Ask Lioncore"}
      </Button>
    </div>
  );
}
