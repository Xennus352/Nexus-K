"use client";

import { useState } from "react";

/**
 * The transfer screenshot a player attached to a deposit, for an operator.
 *
 * A client component for one reason: the bytes come from an admin-gated route, so
 * the image cannot be a plain `<img src>` in server-rendered markup without
 * either leaking the route shape into the HTML or embedding a base64 blob of a
 * bank statement in the page. Fetching it after mount keeps the HTML free of both,
 * and gives a real error state when the route refuses.
 *
 * Click to enlarge. A phone screenshot of a bank statement is unreadable at
 * thumbnail size, and an operator approving money has to be able to read the
 * amount and the account holder.
 */
export default function SlipThumb({
  trx,
  name,
}: {
  trx: string;
  /** Original filename, for the label and the alt text. */
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const [src, setSrc] = useState("");

  async function load() {
    setState("loading");
    try {
      const res = await fetch(`/api/admin/slip/${encodeURIComponent(trx)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setSrc((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setState("ok");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (state !== "ok") void load();
          setOpen(true);
        }}
        title={`View transfer screenshot: ${name}`}
        className="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left transition hover:border-sky-400/40 hover:bg-white/10"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-sky-500/15 text-xs text-sky-300">
          🧾
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-slate-200">{name}</span>
          <span className="block text-[10px] text-slate-500">
            {state === "failed" ? "could not load" : state === "ok" ? "screenshot attached" : "view screenshot"}
          </span>
        </span>
        {state === "ok" && <span className="shrink-0 text-[10px] text-sky-300">view</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="max-h-full max-w-4xl overflow-auto">
            {state === "ok" && src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`Transfer screenshot for deposit ${trx}`}
                className="max-h-[85vh] w-auto rounded-xl border border-white/10"
              />
            ) : (
              <p className="text-sm text-slate-300">
                {state === "failed" ? "That screenshot could not be loaded." : "Loading…"}
              </p>
            )}
            <p className="mt-3 text-center text-xs text-slate-500">
              {name} · click anywhere to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}