"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { coinsToCash } from "@/lib/money";

export type MethodChoice = {
  id: string;
  name: string;
  code: string;
  logo: string;
  currency: string;
  minAmount: number;
  maxAmount: number;
  percentFee: number;
  fixedFee: number;
  rate: number;
  fields: { key: string; label: string; type: string; optional?: boolean }[];
};

export default function WithdrawForm({
  methods,
  wallet,
  defaultMethodId,
}: {
  methods: MethodChoice[];
  wallet: number;
  defaultMethodId?: string;
}) {
  const [methodId, setMethodId] = useState(defaultMethodId ?? methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const method = methods.find((m) => m.id === methodId);
  const coins = Number.parseFloat(amount);
  const valid = Number.isFinite(coins) && coins > 0;

  const fee =
    valid && method ? (coins * method.percentFee) / 100 + method.fixedFee : 0;
  const charge = valid ? coins + fee : 0;
  const payout =
    valid && method ? coinsToCash(coins, method.rate, method.currency) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    setBusy(true);
    try {
      const body = new FormData();
      body.set("methodId", methodId);
      body.set("amount", amount);
      for (const [k, v] of Object.entries(details)) body.set(k, v);
      const res = await fetch("/api/withdrawals", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        trx?: string;
        error?: string;
      };
      if (!res.ok || !json.trx) {
        setError(json.error ?? "Could not submit the withdrawal.");
        setBusy(false);
        return;
      }
      setDone(json.trx);
      setBusy(false);
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Notice tone="success">
        Withdrawal <span className="font-mono font-bold">{done}</span> is pending review. The
        amount has been reserved from your balance and an operator will confirm the payout.
      </Notice>
    );
  }

  if (methods.length === 0) {
    return <Notice tone="info">No payout method is available yet. Please contact support.</Notice>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <span className="mb-2 block text-xs font-semibold tracking-wide text-slate-300">
          PAYOUT METHOD
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {methods.map((m) => {
            const active = m.id === methodId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethodId(m.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                  active
                    ? "border-sky-400 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                    : "border-white/10 bg-[#2b3a6e] hover:border-white/25"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.logo}
                  alt=""
                  aria-hidden
                  className="h-9 w-9 rounded-lg bg-white/90 object-contain p-1"
                />
                <span className="text-xs font-semibold leading-tight">{m.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Field
        label="AMOUNT (COINS)"
        hint={
          method
            ? `Balance ${wallet.toLocaleString()} · ${method.minAmount.toLocaleString()}–${method.maxAmount.toLocaleString()} coins`
            : undefined
        }
      >
        <div className="flex gap-2">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setAmount(String(wallet))}
            className="shrink-0 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 text-sm font-bold text-sky-300 transition hover:bg-sky-500/20"
          >
            MAX
          </button>
        </div>
      </Field>

      {valid && method && (
        <div className="rounded-xl border border-white/10 bg-[#2b3a6e] p-4 text-sm">
          <Row label="Fee" value={`${fee.toFixed(2)} coins`} />
          <Row label="Reserved from balance" value={`${charge.toFixed(2)} coins`} strong />
          <Row
            label={`You receive (${method.currency})`}
            value={payout.toFixed(2)}
            strong
          />
        </div>
      )}

      {method && (
        <div className="grid gap-4 sm:grid-cols-2">
          {method.fields.map((f) => (
            <Field key={f.key} label={`${f.label.toUpperCase()}${f.optional ? " (OPTIONAL)" : ""}`}>
              <input
                className={inputClass}
                value={details[f.key] ?? ""}
                onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                required={!f.optional}
              />
            </Field>
          ))}
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      <Button type="submit" disabled={busy || !valid}>
        {busy ? "Submitting…" : "Request payout"}
      </Button>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-400">{label}</span>
      <span className={strong ? "font-mono font-bold text-sky-200" : "font-mono text-slate-200"}>
        {value}
      </span>
    </div>
  );
}