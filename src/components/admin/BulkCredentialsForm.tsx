"use client";

// Bulk password tool: choose players, replace their passwords, take away a CSV.
//
// A client component only for the clipboard and the file download, which cannot be
// done server-side. The form itself posts through `bulkSetPasswords` as a plain
// `<form action>`, so it keeps a real `$ACTION_ID` in the HTML — it works with
// JavaScript disabled, and `scripts/e2e-http.mts` can replay it.
//
// The password column only exists in the response body and in this component's
// state. Nothing on the server persists it.

import { useRef, useState } from "react";
import { AlertTriangle, ClipboardCopy, Download, KeyRound } from "lucide-react";
import PasswordField from "@/components/PasswordField";

export type CredentialPlayer = { id: string; email: string; username: string };

export default function BulkCredentialsForm({
  action,
  players,
  total,
  csv,
  count,
  failures,
  q,
  status,
}: {
  action: (form: FormData) => void | Promise<void>;
  players: CredentialPlayer[];
  total: number;
  /** Present after a successful run. */
  csv?: string;
  count?: number;
  failures?: string[];
  q: string;
  status: string;
}) {
  const [mode, setMode] = useState<"generate" | "single">("generate");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLAnchorElement>(null);

  const field =
    "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500";

  async function copyCsv() {
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access needs a secure context and can be denied. The textarea below
      // is selectable either way, so there is always a way to get the value out.
      setCopied(false);
    }
  }

  function downloadCsv() {
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = fileRef.current;
    if (!a) return;
    a.href = url;
    a.download = `player-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {csv !== undefined && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex-1 text-sm font-bold text-emerald-200">
              Password sheet for {count} player{count === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              onClick={copyCsv}
              className="flex items-center gap-2 rounded-xl bg-emerald-600/80 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy CSV"}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="flex items-center gap-2 rounded-xl bg-emerald-600/80 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <a ref={fileRef} className="hidden" aria-hidden />
          </div>

          {failures && failures.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">
              {failures.map((f) => (
                <li key={f}>not changed — {f}</li>
              ))}
            </ul>
          )}

          <textarea
            readOnly
            value={csv}
            rows={Math.min(14, csv.split("\n").length)}
            onFocus={(e) => e.currentTarget.select()}
            className={`${field} mt-3 font-mono text-xs`}
            aria-label="Generated credentials"
          />
          <p className="mt-2 text-xs text-emerald-300/80">
            Held in memory for ten minutes, then discarded. It is never written to the database —
            copy or download it now.
          </p>
        </section>
      )}

      <form action={action} className="space-y-5">
        {/* Carried through so "apply to everyone this search matches" reuses the
            filter this page was rendered with. */}
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="status" value={status} />

        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-100/90">
              This <strong>replaces</strong> the password of every player below. It does not
              reveal the existing ones — those are hashed and cannot be read back. Anyone you
              reset signs in with a password you have not told them, so send the sheet over
              afterwards.
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-300">
            PASSWORD
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                mode === "generate"
                  ? "border-sky-500/50 bg-sky-500/10"
                  : "border-white/10 bg-[#2b3a6e]"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="generate"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
                className="mt-0.5 accent-sky-500"
              />
              <span>
                <span className="block text-sm font-bold text-slate-100">
                  Generate one for each player
                </span>
                <span className="block text-xs text-slate-400">
                  12 characters, no look-alike characters. Safest for handing out.
                </span>
              </span>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                mode === "single"
                  ? "border-sky-500/50 bg-sky-500/10"
                  : "border-white/10 bg-[#2b3a6e]"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="single"
                checked={mode === "single"}
                onChange={() => setMode("single")}
                className="mt-0.5 accent-sky-500"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-100">
                  Use one shared password
                </span>
                <span className="block text-xs text-slate-400">
                  Everyone ends up with the same secret. Only for a test fixture set.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {mode === "single" && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
              SHARED PASSWORD
            </span>
            <PasswordField
              name="password"
              minLength={6}
              autoComplete="new-password"
              placeholder="min 6 characters"
              className={field}
            />
          </label>
        )}

        <fieldset>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <legend className="text-xs font-semibold tracking-wide text-slate-300">
              PLAYERS ({players.length} shown{total > players.length ? ` of ${total}` : ""})
            </legend>
            <span className="text-xs text-slate-500">
              {q || status ? "Filtered by this page's search." : "Showing the newest accounts."}
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#16224a]">
            {players.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">
                No players match. Clear the search on the players page first.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {players.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/5">
                      <input type="checkbox" name="ids" value={p.id} className="accent-sky-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-100">{p.email}</span>
                        {p.username && (
                          <span className="block truncate text-[11px] text-slate-500">
                            @{p.username}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-3">
            <input
              type="checkbox"
              name="allMatching"
              value="1"
              className="mt-0.5 accent-sky-500"
            />
            <span>
              <span className="block text-sm font-bold text-slate-100">
                Apply to everyone this search matches
              </span>
              <span className="block text-xs text-slate-400">
                Ignores the tick boxes above and resets the whole filtered set, up to 100 players.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <input
            type="checkbox"
            name="confirm"
            value="1"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span className="text-sm text-amber-100">
            I understand this signs every selected player out of their current password, and that
            I am responsible for delivering the new ones.
          </span>
        </label>

        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-2.5 text-sm font-bold transition hover:brightness-110"
        >
          <KeyRound className="h-4 w-4" />
          Set passwords and build the sheet
        </button>
      </form>
    </div>
  );
}
