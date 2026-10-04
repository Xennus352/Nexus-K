"use client";

// "Set password" panel for a single player, in the back office.
//
// A client component only so the field can carry the same reveal toggle as the
// sign-in screens — the form posts through `setPlayerPassword`, a server action, so
// nothing about the password itself is client-trusted.
//
// Note what this panel does *not* do: it cannot show the player's current password.
// That one is a bcrypt hash on our side and a hashed secret in the engine, so it is
// unrecoverable by design. Setting a new one is the only operation available, which
// is the honest answer to "I have lost a player's password".

import { KeyRound } from "lucide-react";
import PasswordField from "@/components/PasswordField";

export default function PlayerPasswordForm({
  action,
  userId,
  email,
}: {
  action: (form: FormData) => void | Promise<void>;
  userId: string;
  email: string;
}) {
  const field =
    "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={userId} />

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
          NEW PASSWORD
        </span>
        <PasswordField
          name="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="min 6 characters"
          className={field}
        />
      </label>

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-2.5 text-sm font-bold transition hover:brightness-110"
      >
        <KeyRound className="h-4 w-4" />
        Set password
      </button>

      <p className="text-xs text-slate-500">
        Replaces the password for {email} immediately, and the old one stops working. A player
        who is already signed in keeps their session — sessions are stateless cookies here, so
        there is nothing to revoke; it lapses within a day.
      </p>
    </form>
  );
}
