import Link from "next/link";
import { Gem, Plus, Minus, LogOut } from "lucide-react";
import { logout } from "@/server/actions";
import BalanceReadout from "@/components/BalanceReadout";
import NotificationBell from "@/components/NotificationBell";
import type { Notice } from "@/server/notices";

export default async function Topbar({
  email,
  username,
  uid,
  balance,
  notices,
}: {
  email: string;
  /** Falls back to the email's first letter for the avatar. */
  username?: string;
  /** Engine uid, so the live balance and notifications ignore another account. */
  uid: number;
  /** Authoritative engine balance, or null when the engine could not be read. */
  balance: number | null;
  /** Server-rendered money events, so the bell's badge is right on first paint. */
  notices: Notice[];
}) {
  const initial = (username?.trim() || email)[0].toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-blue-950 bg-[#2f3f76]/85 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
      <div className="hidden items-center gap-2 text-amber-300 md:flex">
        <Gem className="h-5 w-5" />
        <span className="font-bold">VIP</span>
        <span className="text-slate-500">DIAMOND</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <div className="min-w-0 max-w-[180px] sm:max-w-none rounded-xl border border-sky-500/30 bg-sky-950/40 px-2 py-1.5 text-right sm:px-4 sm:py-2">
          <div className="text-[9px] tracking-widest text-sky-400 sm:text-[10px]">TOTAL BALANCE</div>
          <div
            data-testid="topbar-balance"
            className="truncate font-mono text-base font-bold text-sky-200 sm:text-lg"
          >
            {/* Live: counts to each new figure and follows updates the game
                broadcasts from another tab. */}
            <BalanceReadout uid={uid} initial={balance} />
          </div>
        </div>
        <Link
          href="/deposit"
          aria-label="Deposit"
          className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2.5 font-bold shadow-[0_0_20px_rgba(56,189,248,0.4)] transition hover:brightness-110 sm:px-5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Deposit</span>
        </Link>
        <Link
          href="/withdraw"
          aria-label="Withdraw"
          className="flex items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-950/40 px-3 py-2.5 font-bold text-sky-200 transition hover:border-sky-400/60 hover:bg-sky-900/50 sm:px-5"
        >
          <Minus className="h-4 w-4" />
          <span className="hidden sm:inline">Withdraw</span>
        </Link>

        <NotificationBell uid={uid} initial={notices} />

        {/* The avatar is the account menu's trigger. It carries the username as a
            label rather than just the initial, so the control is not a mystery
            circle to a screen reader. */}
        <Link
          href="/account"
          title={`${email} — my account`}
          aria-label="My account"
          data-testid="account-avatar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-sky-900 font-bold text-sky-200 transition hover:border-sky-300 hover:bg-sky-800"
        >
          {initial}
        </Link>
        <form action={logout} className="shrink-0">
          <button
            title="Logout"
            aria-label="Logout"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition hover:bg-white/10"
          >
            <LogOut className="h-5 w-5 text-slate-500 hover:text-white" />
          </button>
        </form>
      </div>
    </header>
  );
}