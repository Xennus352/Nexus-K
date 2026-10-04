"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  Gamepad2,
  Gem,
  LayoutDashboard,
  UserRound,
  Wallet,
} from "lucide-react";

// `match` is what marks the entry active: "/" only on the exact path, deeper
// routes on any sub-path (so /deposit/[trx] keeps "Deposit" lit).
const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: "exact" },
  { href: "/lobby", label: "Casino", icon: Gamepad2, hot: true, match: "prefix" },
  { href: "/deposit", label: "Deposit", icon: BanknoteArrowDown, match: "prefix" },
  { href: "/withdraw", label: "Withdraw", icon: BanknoteArrowUp, match: "prefix" },
  { href: "/wallet", label: "Wallet", icon: Wallet, match: "prefix" },
  { href: "/account", label: "My Account", icon: UserRound, match: "prefix" },
];

export default function Sidebar({
  email,
  refCode,
  balance,
  status,
}: {
  email: string;
  /** Referral code, so the player can see and copy it without leaving the nav. */
  refCode: string;
  /** Shown in the account card; null when the engine balance could not be read. */
  balance: number | null;
  status: string;
}) {
  const path = usePathname();
  const blocked = status !== "active";

  return (
    // `sticky top-0 h-screen self-start` rather than a stretched flex item: a
    // stretched aside is as tall as the whole document, so it has no room to
    // stick and scrolls away with the content. Pinning it to the viewport height
    // is what keeps the nav and the account card on screen however far down the
    // player scrolls.
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-blue-950 bg-[#2f3f76] p-5 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Gem className="h-7 w-7 text-sky-400" />
        <div>
          <div className="text-xl font-black tracking-tight">
            NEXUS<span className="text-sky-400">-K</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-blue-400">BLUE DIAMOND</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon, hot, match }) => {
          const active = match === "exact" ? path === href : path.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-sky-500/15 text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" /> {label}
              </span>
              {hot && <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold">HOT</span>}
            </Link>
          );
        })}
      </nav>

      {/* The account card replaces the VIP panel that used to sit here. That
          panel was a marketing block with a "Claim daily bonus" button pointing
          at /wallet, which made the nav the less direct route to the bonus than
          the wallet itself. Putting the player's own identity and referral code
          here answers the question the panel was really being asked — "who am I
          logged in as" — on every screen. */}
      <div className="mt-auto pt-6">
        <Link
          href="/account"
          className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-sky-400/40 hover:bg-black/30"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-sky-900 font-bold text-sky-200">
              {email[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-slate-100">{email}</div>
              <div className="text-[11px] text-slate-500">
                {blocked ? (
                  <span className="font-bold text-rose-300">Account blocked</span>
                ) : balance === null ? (
                  "Balance unavailable"
                ) : (
                  `${balance.toLocaleString()} coins`
                )}
              </div>
            </div>
          </div>

          {refCode && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="text-[9px] tracking-widest text-slate-500">REFERRAL</div>
                <div className="truncate font-mono text-xs font-bold text-sky-300">{refCode}</div>
              </div>
              {/* The delegated handler from CopyButton is mounted once by the
                  layout, so this needs no state of its own. */}
              <button
                type="button"
                data-copy={refCode}
                className="cursor-pointer rounded-md border border-sky-400/30 px-2 py-1 text-[10px] font-bold text-sky-200 transition hover:bg-sky-500/20"
              >
                Copy
              </button>
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}