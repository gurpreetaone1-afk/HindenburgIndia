"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Send } from "lucide-react";
import { NotifyAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuthStore } from "@/stores/authStore";
import { canEdit } from "@/lib/permissions";

export default function AdminNotificationsPage() {
  const me = useAdminAuthStore((s) => s.admin);
  const canSend = canEdit(me, "users");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ push_sent: number; recipients: number } | null>(null);

  async function send() {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) return toast.error("Enter a title and a message");
    if (
      !window.confirm(
        `Send this notification to ALL your users?\n\n"${t}"\n${m}`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await NotifyAPI.broadcast(t, m);
      setLast(res);
      toast.success(`Sent — ${res.recipients} users notified (${res.push_sent} live pop-ups)`);
      setTitle("");
      setMessage("");
    } catch (e: any) {
      toast.error(e?.message || "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Send Notification"
        description="Broadcast a notification to all your users at once. It pops up on their phone / browser even when the app is closed (Web Push) and also lands in their in-app notification bell."
      />

      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4 text-primary" /> New announcement
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            placeholder="e.g. Market holiday tomorrow"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            placeholder="Write the message users will see…"
            value={message}
            maxLength={300}
            rows={4}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="text-right text-[10px] text-muted-foreground">{message.length}/300</div>
        </div>

        <Button
          className="w-full gap-2"
          disabled={!canSend || busy || !title.trim() || !message.trim()}
          onClick={send}
          title={canSend ? "Send to all users" : "View-only access"}
        >
          <Send className="size-4" />
          {busy ? "Sending…" : "Send to all users"}
        </Button>

        {last && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            Last broadcast reached <b>{last.recipients}</b> users — <b>{last.push_sent}</b> live
            device pop-ups delivered.
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Live pop-ups reach users who have allowed notifications (web / installed PWA). It always
          lands in the in-app bell for every user. Native app (Play Store) pop-ups need the push
          build — ask the developer if not yet enabled.
        </p>
      </div>
    </div>
  );
}
