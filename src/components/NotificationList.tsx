"use client";

import Link from "next/link";
import { useState } from "react";
import { BellOff, RotateCw } from "lucide-react";
import type { Notice } from "@/server/notices";

/** Maximum notifications to show in the account activity list. */
const MAX_NOTICES = 3;

/**
 * The same feed the topbar bell shows, rendered inline.
 *
 * A bell is invisible by design — it tells you that something exists, not what. On
 * the account screen, which is where a player goes specifically to find out what
 * is happening to their money, that indirection is in the way.
 *
 * The list arrives server-rendered, so there is no loading flash on a screen whose
 * whole job is to show the current state; the refresh button exists for the case
 * the server render was a moment ago — an operator approved a deposit in another
 * tab while this page sat open.
 */
export default function NotificationList({ initial }: { initial: Notice[] }) {
  const [notices, setNotices] = useState<Notice[]>(initial);
  const [busy, setBusy] = useState(false);

  // Re-sync when the server sends a new list. Adjusted during render rather than
  // in an effect: this is the documented way to track a prop in state, and an
  // effect would paint one frame of the old list first.
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setNotices(initial);
  }

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { notices?: Notice[] };
        if (json.notices) setNotices(json.notices);
      }
    } finally {
      setBusy(false);
    }
  }

  if (notices.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#35478a] px-4 py-4 text-sm text-slate-400">
        <BellOff className="h-5 w-5 shrink-0 text-slate-500" />
        No deposit or withdrawal activity yet.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/5 bg-[#35478a]"
      data-testid="account-activity"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Activity</span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          aria-label="Refresh activity"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-300 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <ul>
        {notices.slice(0, MAX_NOTICES).map((n) => (
          <li key={n.id} className="border-b border-white/5 last:border-0">
            <Link
              href={n.href}
              className="flex items-start gap-3 px-4 py-3 transition hover:bg-white/5"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.tone === "good"
                    ? "bg-emerald-400"
                    : n.tone === "bad"
                      ? "bg-rose-400"
                      : "bg-sky-400"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-100">{n.title}</span>
                <span className="block text-xs text-slate-400">{n.body}</span>
              </span>
              <time dateTime={n.at} className="shrink-0 text-[11px] text-slate-500">
                {new Date(n.at).toLocaleDateString()}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}