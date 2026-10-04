"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gamepad2,
  Crown,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Wallet,
  Headset,
  Gem,
} from "lucide-react";

// `match` is what marks the entry active: "/" only on the exact path, deeper
// routes on any sub-path (so /deposit/[trx] keeps "Deposit" lit).
const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: "exact" },
  { href: "/lobby", label: "Casino", icon: Gamepad2, hot: true, match: "prefix" },
  { href: "/deposit", label: "Deposit", icon: BanknoteArrowDown, match: "prefix" },
  { href: "/withdraw", label: "Withdraw", icon: BanknoteArrowUp, match: "prefix" },
  { href: "/wallet", label: "Wallet", icon: Wallet, match: "prefix" },
  { href: "/support", label: "Support", icon: Headset, match: "prefix" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-blue-950 bg-[#2f3f76] p-5 md:flex">
      <div className="mb-8 flex items-center gap-2">
        <Gem className="h-7 w-7 text-sky-400" />
        <div>
          <div className="text-xl font-black tracking-tight">
            NEXUS<span className="text-sky-400">-K</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-blue-400">BLUE DIAMOND</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon, hot, match }) => {
          const active = match === "exact" ? path === href : path.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
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
      <div className="mt-auto rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/60 to-[#140a2a] p-4">
        <div className="flex items-center gap-2 text-amber-300">
          <Crown className="h-4 w-4" /> <span className="text-sm font-bold">VIP DIAMOND</span>
        </div>
        <p className="mt-1 text-xs text-amber-100/60">Exclusive rewards await.</p>
        <Link
          href="/wallet"
          className="mt-3 block rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2 text-center text-sm font-bold text-black transition hover:brightness-110"
        >
          Claim daily bonus
        </Link>
      </div>
    </aside>
  );
}
