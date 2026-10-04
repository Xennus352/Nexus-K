"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknoteArrowDown,
  Gamepad2,
  LayoutDashboard,
  UserRound,
  Wallet,
} from "lucide-react";

// Withdraw is deliberately absent: it is a single tap from Deposit in the topbar,
// and a four-item bar with a fifth squeezed in is harder to hit than four.
const items = [
  { href: "/", label: "Home", icon: LayoutDashboard, match: "exact" as const },
  { href: "/lobby", label: "Games", icon: Gamepad2, match: "prefix" as const },
  { href: "/deposit", label: "Deposit", icon: BanknoteArrowDown, match: "prefix" as const },
  { href: "/wallet", label: "Wallet", icon: Wallet, match: "prefix" as const },
  { href: "/account", label: "Account", icon: UserRound, match: "prefix" as const },
];

export default function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-white/10 bg-[#1c2a55]/95 px-2 py-3 backdrop-blur md:hidden">
      {items.map(({ href, label, icon: Icon, match }) => {
        const active = match === "exact" ? path === href : path.startsWith(href);
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 text-xs font-semibold ${active ? "text-sky-400" : "text-slate-400"}`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}