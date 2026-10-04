// Back-office shell (client).
//
// Only the chrome is a client component: it needs `usePathname` for the active
// nav highlight. Everything it renders as children is server-rendered output
// passed through from src/app/admin/layout.tsx, so the actual pages stay server
// components and can query the database directly.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CreditCard,
  Gauge,
  Gem,
  IdCard,
  Landmark,
  LogOut,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { adminLogout } from "@/server/admin-actions";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; icon: typeof Gauge; exact?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: Gauge, exact: true },
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/admin/deposits", label: "Deposits", icon: CreditCard },
      { href: "/admin/withdrawals", label: "Withdrawals", icon: Landmark },
      { href: "/admin/transactions", label: "Ledger", icon: ScrollText },
    ],
  },
  {
    group: "Configuration",
    items: [
      { href: "/admin/gateways", label: "Payment rails", icon: Wallet },
      { href: "/admin/withdraw-methods", label: "Payout methods", icon: Landmark },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/admin/users", label: "Players", icon: Users },
      { href: "/admin/kyc", label: "Verification", icon: IdCard },
      { href: "/admin/admins", label: "Staff", icon: Activity },
    ],
  },
];

export default function AdminShell({
  admin,
  children,
}: {
  admin: { name: string; username: string; role: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? path === href : path.startsWith(href));
  const flat = NAV.flatMap((g) => g.items);

  return (
    <div className="flex min-h-screen bg-[#16224d] text-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-[#1b2a5e] lg:flex">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <Gem className="h-6 w-6 text-sky-400" />
          <div>
            <div className="text-lg font-black tracking-tight">
              NEXUS<span className="text-sky-400">-K</span>
            </div>
            <div className="text-[10px] tracking-[0.25em] text-blue-400">BACK OFFICE</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.group} className="mb-5">
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active(href, exact)
                        ? "bg-sky-500/15 text-sky-300 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3">
          <Link
            href="/"
            className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Player site
          </Link>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-slate-200">
                {admin.name || admin.username}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-sky-400">{admin.role}</div>
            </div>
            <form action={adminLogout}>
              <button title="Sign out" aria-label="Sign out">
                <LogOut className="h-4 w-4 text-slate-400 transition hover:text-white" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/5 bg-[#1b2a5e] px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-sky-400" />
            <span className="text-sm font-black">NEXUS-K · BACK OFFICE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-sky-400">{admin.role}</span>
            <form action={adminLogout}>
              <button title="Sign out" aria-label="Sign out">
                <LogOut className="h-4 w-4 text-slate-400" />
              </button>
            </form>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {flat.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                  active(href) ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-slate-400"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}