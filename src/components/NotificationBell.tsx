"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import type { Notice } from "@/server/notices";

/** How often to re-read while the panel is open and the tab is visible. */
const POLL_MS = 30_000;

const seenKey = (uid: number) => `nk_seen_${uid}`;

/**
 * The bell in the topbar.
 *
 * This was previously a decorative icon with a permanently red dot and no handler
 * behind it, which is worse than having no bell at all: it promised a signal that
 * could never arrive. It now shows the player's real money events — the deposit
 * and withdrawal rows that already exist — and the dot means something.
 *
 * `initial` arrives server-rendered, so the badge is right on the first paint
 * instead of appearing a moment later after a client fetch. The polling only runs
 * while the panel is open: a closed bell has nothing to show, and re-reading it
 * every thirty seconds for the whole session would be a request per player per
 * half-minute to render a number nobody is looking at.
 */
export default function NotificationBell({
  uid,
  initial,
}: {
  uid: number;
  initial: Notice[];
}) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>(initial);
  const [loading, setLoading] = useState(false);
  const [seen, setSeen] = useState<number>(() => Date.parse(readSeen(uid)) || 0);
  const root = useRef<HTMLDivElement>(null);

  // A new server render is authoritative and replaces whatever the last poll
  // produced. Adjusted during render rather than in an effect — the documented way
  // to track a prop in state — so there is no frame where the badge shows a
  // mixture of the two.
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setNotices(initial);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { notices?: Notice[] };
      if (json.notices) setNotices(json.notices);
    } catch {
      /* offline or signed out — leave whatever is already on screen */
    } finally {
      setLoading(false);
    }
  }, []);

  // The first read is fired by the bell's own click handler rather than from this
  // effect, which then only schedules the repeat. Calling `load()` in the effect
  // body would flip the spinner in the same tick as the render that mounted it.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      // Polling a tab nobody is looking at is the polling this app deliberately
      // avoids elsewhere; pause while the document is hidden and catch up when it
      // comes back.
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  // Close on an outside click or Escape. Without this the panel is a dialog with
  // no dismissal other than hitting the bell again, which reads as broken on
  // desktop where the bell is not the only thing under the cursor.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = notices.filter((n) => Date.parse(n.at) > seen).length;

  function markAllRead() {
    const now = Date.now();
    try {
      localStorage.setItem(seenKey(uid), String(now));
    } catch {
      /* private mode: the badge simply keeps counting */
    }
    setSeen(now);
  }

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => {
          // Re-read on open rather than on a timer that runs all day: the server
          // render already gave us this list, and a click is the one moment the
          // player has said they want to see it.
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        data-testid="notif-bell"
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-white/10 transition hover:border-sky-400/50 hover:bg-white/5"
      >
        <Bell className={`h-5 w-5 ${unread > 0 ? "text-sky-300" : "text-slate-400"}`} />
        {unread > 0 && (
          <span
            data-testid="notif-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#16204a] shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              Notifications
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />}
            </span>
            {notices.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-300 transition hover:bg-white/10"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notices.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                Nothing yet. Deposit or withdraw activity shows up here.
              </p>
            ) : (
              notices.map((n) => {
                const isUnread = Date.parse(n.at) > seen;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => {
                      markAllRead();
                      setOpen(false);
                    }}
                    className="flex gap-3 border-b border-white/5 px-4 py-3 transition last:border-0 hover:bg-white/5"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.tone === "good"
                          ? "bg-emerald-400"
                          : n.tone === "bad"
                            ? "bg-rose-400"
                            : "bg-sky-400"
                      } ${isUnread ? "" : "opacity-30"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-xs ${isUnread ? "font-bold text-slate-100" : "font-medium text-slate-300"}`}
                      >
                        {n.title}
                      </span>
                      <span className="block text-[11px] leading-snug text-slate-400">{n.body}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{when(n.at)}</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** localStorage is the read marker; a cleared or unavailable one means "all unread". */
function readSeen(uid: number): string {
  try {
    return localStorage.getItem(seenKey(uid)) ?? "";
  } catch {
    return "";
  }
}

/** Compact relative time. Avoids a second date library for six words. */
function when(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}