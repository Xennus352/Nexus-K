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
  const coins = Math.floor(Number.parseFloat(amount) || 0);
  const valid = coins > 0;

  const fee =
    valid && method ? Math.round((coins * method.percentFee) / 100 + method.fixedFee) : 0;
  const charge = valid ? coins + fee : 0;
  const payout =
    valid && method ? Math.round(coinsToCash(coins, method.rate, method.currency)) : 0;

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
    return <Notice tone="info">No payout method is available yet. Please check back shortly.</Notice>;
  }

  /**
   * Requests with nothing in them.
   *
   * Checked here rather than trusted to the browser's `required`, because the
   * submit path builds its own FormData and the amount is typed by hand with a
   * comma-tolerant parse on the server. The MAX shortcut in particular can put a
   * value on screen that the method's own ceiling will reject, and finding that
   * out only after pressing the button is the worst place to find it.
   */
  const missingRequired = method
    ? method.fields
        .filter((f) => !f.optional && !(details[f.key] ?? "").trim())
        .map((f) => f.label)
    : [];
  // Compared against `coins`, not the raw string: `amount` is still whatever the
  // player typed, and `"9" < 10` is false while `9 > 10` is false too — but
  // `"100" < 10` is true, so a numeric-looking string would sail past a string
  // comparison and reach the server, which would then reject it.
  const overMax = valid && method ? coins > Math.floor(method.maxAmount) : false;
  const underMin = valid && method ? coins < Math.floor(method.minAmount) : false;
  const overBalance = valid && coins > Math.floor(wallet);
  const blocked =
    !valid ||
    missingRequired.length > 0 ||
    overMax ||
    underMin ||
    overBalance;

  const blocker = !valid
    ? "Enter an amount."
    : underMin
      ? `The minimum for ${method?.name} is ${Math.floor(method?.minAmount ?? 0).toLocaleString()} coins.`
      : overMax
        ? `The maximum for ${method?.name} is ${Math.floor(method?.maxAmount ?? 0).toLocaleString()} coins.`
        : overBalance
          ? `That is more than your balance of ${Math.floor(wallet).toLocaleString()} coins.`
          : missingRequired.length > 0
            ? `Fill in: ${missingRequired.join(", ")}.`
            : "";

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
            ? `Balance ${Math.floor(wallet).toLocaleString()} · ${Math.floor(method.minAmount).toLocaleString()}–${Math.floor(method.maxAmount).toLocaleString()} coins`
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
          <Row label="Fee" value={`${fee.toLocaleString()} coins`} />
          <Row label="Reserved from balance" value={`${charge.toLocaleString()} coins`} strong />
          <Row label={`You receive (${method.currency})`} value={payout.toLocaleString()} strong />
        </div>
      )}

      {method && (
        <div className="grid gap-4 sm:grid-cols-2">
          {method.fields.map((f) => (
            <Field
              key={f.key}
              label={`${f.label.toUpperCase()}${f.optional ? " (OPTIONAL)" : ""}`}
              hint={
                !f.optional && !(details[f.key] ?? "").trim()
                  ? "Required — the operator pays out to exactly this."
                  : undefined
              }
            >
              <input
                className={inputClass}
                // `text` with an inputMode is right for a phone number or an
                // account number: `tel` makes some mobile keyboards drop the
                // digits on paste, and `number` mangles anything with a country
                // code or a leading zero — which a KPay number has both of.
                type="text"
                inputMode="tel"
                autoComplete="off"
                value={details[f.key] ?? ""}
                onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      )}

      {error && <Notice>{error}</Notice>}
      {blocker && <p className="text-xs font-semibold text-amber-300/90">{blocker}</p>}

      <Button type="submit" disabled={busy || blocked}>
        {busy ? "Submitting…" : "Request payout"}
      </Button>
      <p className="text-xs text-slate-500">
        Sending this also alerts the operator&apos;s Telegram, with your amount and{" "}
        {method?.name ?? "payout"} number, so the payout is not waiting on someone to notice the
        queue.
      </p>
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