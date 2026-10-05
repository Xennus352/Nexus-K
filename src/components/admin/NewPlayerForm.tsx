"use client";

// "New player" form for the back office.
//
// Players cannot register themselves, so this is the only door into the system:
// it provisions the slotopol account and the casino row together and hands the
// player a password. It is a client component only because the password field
// carries the same reveal toggle as the sign-in screens — the form posts through
// `createPlayer`, a server action, so nothing about it is client-trusted.
//
// The disclosure is a native <details>, not a React `useState` toggle: that keeps
// the <form> in the server-rendered HTML, so it works with JavaScript disabled and
// so scripts/e2e-http.mts can find its $ACTION_ID and replay it.
//
// Rendered only for superadmins, which is also what the action enforces.

import { UserPlus } from "lucide-react";
import PasswordField from "@/components/PasswordField";

export default function NewPlayerForm({ action }: { action: (form: FormData) => void | Promise<void> }) {
  const field =
    "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500";

  return (
    <details className="group rounded-2xl border border-sky-500/20 bg-[#1b2a5e]">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 transition hover:bg-white/5">
        <UserPlus className="h-4 w-4 shrink-0 text-sky-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-100">Create a player account</span>
          <span className="block text-xs text-slate-400">
            Public registration is closed. This sets the password the player signs in with.
          </span>
        </span>
        <span className="shrink-0 text-lg leading-none text-slate-400 transition group-open:rotate-90">›</span>
      </summary>

      <form action={action} className="grid gap-4 border-t border-white/10 p-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">EMAIL</span>
          <input name="email" type="email" required autoComplete="off" placeholder="player@example.com" className={field} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">PASSWORD</span>
          <PasswordField
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="min 6 characters"
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
            USERNAME <span className="font-normal normal-case text-slate-500">(optional)</span>
          </span>
          <input name="username" autoComplete="off" placeholder="Defaults to the email handle" className={field} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
            REFERRED BY <span className="font-normal normal-case text-slate-500">(optional)</span>
          </span>
          <input
            name="refCode"
            autoComplete="off"
            placeholder="Referral code"
            className={`${field} uppercase`}
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Pays the referral bonus to both sides.
          </span>
        </label>

        <div className="sm:col-span-2">
          <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-2.5 text-sm font-bold transition hover:brightness-110">
            Create account
          </button>
        </div>
      </form>
    </details>
  );
}