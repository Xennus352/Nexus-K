import { Gem, Bell, Plus, LogOut } from "lucide-react";
import { logout, addFunds } from "@/server/actions";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

export default async function Topbar({
  email,
  uid,
  token,
}: {
  email: string;
  uid: number;
  token: string;
}) {
  let wallet: number | null = null;
  try {
    const res = await fetch(`${ENGINE}/prop/wallet/get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cid: 1, uid }),
      cache: "no-store",
    });
    const j = await res.json();
    if (!j.what) wallet = j.wallet;
  } catch {
    /* engine offline */
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-blue-950 bg-[#2f3f76]/85 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
      <div className="hidden items-center gap-2 text-amber-300 sm:flex">
        <Gem className="h-5 w-5" />
        <span className="font-bold">VIP</span>
        <span className="text-slate-500">DIAMOND</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <div className="min-w-0 rounded-xl border border-sky-500/30 bg-sky-950/40 px-2 py-1.5 text-right sm:px-4 sm:py-2">
          <div className="text-[9px] tracking-widest text-sky-400 sm:text-[10px]">TOTAL BALANCE</div>
          <div className="truncate font-mono text-base font-bold text-sky-200 sm:text-lg">
            💎 {wallet !== null ? wallet.toLocaleString() : "—"}
          </div>
        </div>
        <form action={addFunds}>
          <button aria-label="Deposit" className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2.5 font-bold shadow-[0_0_20px_rgba(56,189,248,0.4)] transition hover:brightness-110 sm:px-5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Deposit</span>
          </button>
        </form>
        <div className="relative hidden sm:block">
          <Bell className="h-5 w-5 text-slate-400" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-sky-900 font-bold text-sky-200 sm:h-10 sm:w-10">
          {email[0].toUpperCase()}
        </div>
        <form action={logout} className="shrink-0">
          <button title="Logout"><LogOut className="h-5 w-5 text-slate-500 hover:text-white" /></button>
        </form>
      </div>
    </header>
  );
}
