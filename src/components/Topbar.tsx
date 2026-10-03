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
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-blue-950 bg-[#232f5c]/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-2 text-amber-300">
        <Gem className="h-5 w-5" />
        <span className="font-bold">VIP</span>
        <span className="text-slate-500">DIAMOND</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-2 text-right">
          <div className="text-[10px] tracking-widest text-sky-400">TOTAL BALANCE</div>
          <div className="font-mono text-lg font-bold text-sky-200">
            💎 {wallet !== null ? wallet.toLocaleString() : "—"}
          </div>
        </div>
        <form action={addFunds}>
          <button className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 font-bold shadow-[0_0_20px_rgba(56,189,248,0.4)] transition hover:brightness-110">
            <Plus className="h-4 w-4" /> Deposit
          </button>
        </form>
        <div className="relative">
          <Bell className="h-5 w-5 text-slate-400" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/50 bg-sky-900 font-bold text-sky-200">
          {email[0].toUpperCase()}
        </div>
        <form action={logout}>
          <button title="Logout"><LogOut className="h-5 w-5 text-slate-500 hover:text-white" /></button>
        </form>
      </div>
    </header>
  );
}
