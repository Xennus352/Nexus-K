"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui";

export type DepositView = {
  trx: string;
  status: string;
  amount: number;
  currency: string;
  coins: number;
  fee: number;
  gatewayAlias: string;
  createdAt: string;
  payUrl: string;
};

/**
 * Live status for one deposit.
 *
 * Polls the status endpoint (which re-checks the provider and settles if
 * needed) until the deposit leaves `pending`, then stops. Polling is bounded to
 * ~3 minutes so a player who walked away does not leave a timer running forever.
 */
export default function DepositStatus({
  trx,
  initialStatus,
  payUrl,
}: {
  trx: string;
  initialStatus: string;
  payUrl: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/payments/status/${encodeURIComponent(trx)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { status?: string };
        if (json.status) setStatus(json.status);
      }
    } finally {
      setChecking(false);
    }
  }, [trx]);

  useEffect(() => {
    if (status !== "pending") return;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 5000;
      void check();
      if (elapsed >= 180_000) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [status, check]);

  const pending = status === "pending";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusBadge status={status} />
      {payUrl && pending && (
        <a
          href={payUrl}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold shadow-[0_0_20px_rgba(56,189,248,0.35)] transition hover:brightness-110"
        >
          Continue to payment →
        </a>
      )}
      <button
        type="button"
        onClick={() => void check()}
        disabled={checking || !pending}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
      >
        {checking ? "Checking…" : "Refresh status"}
      </button>
      {pending && (
        <span className="text-xs text-slate-500">
          This page updates itself for the next 3 minutes.
        </span>
      )}
    </div>
  );
}