"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export type GatewayChoice = {
  id: string;
  alias: string;
  name: string;
  driver: string;
  logo: string;
  currency: string;
  currencies: string[];
  minAmount: number;
  maxAmount: number;
  crypto: boolean;
};

const DRIVER_HINT: Record<string, string> = {
  manual: "Transfer the exact amount, quote your reference, and an operator approves it.",
  stripe: "Visa, Mastercard, Apple Pay and more — you are redirected to Stripe.",
  paypal: "Pay with your PayPal balance, card or bank account.",
  nowpayments: "Send crypto to the address shown; credited once the network confirms.",
};

function Logo({ gateway, className = "h-9 w-9" }: { gateway: GatewayChoice; className?: string }) {
  if (gateway.logo) {
    // The dumped gateway art is a wide 400x180 logo, so it gets a wide box.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={gateway.logo}
        alt=""
        aria-hidden
        className={`${className} shrink-0 rounded-lg bg-white/90 object-contain p-1`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-lg text-sky-300`}
    >
      🏦
    </span>
  );
}

export default function DepositForm({
  gateways,
  min,
  max,
  defaultCurrency,
}: {
  gateways: GatewayChoice[];
  min: number;
  max: number;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(gateways[0]?.id ?? "");
  const selected = gateways.find((g) => g.id === selectedId);
  const [currency, setCurrency] = useState(
    selected && selected.currencies.includes(defaultCurrency)
      ? defaultCurrency
      : (selected?.currencies[0] ?? defaultCurrency),
  );
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const railMin = Math.max(min, selected?.minAmount ?? min);
  const railMax = Math.min(max, selected?.maxAmount ?? max);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = new FormData();
      body.set("gatewayId", selectedId);
      body.set("currency", currency);
      body.set("amount", amount);
      const res = await fetch("/api/payments/checkout", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        redirect?: string;
        error?: string;
      };
      if (!res.ok || !json.redirect) {
        setError(json.error ?? "Could not start the deposit.");
        setBusy(false);
        return;
      }
      // Full navigation (not router.push) so a redirect to an external gateway
      // is a real document load rather than a client-side route attempt.
      window.location.assign(json.redirect);
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  if (gateways.length === 0) {
    return (
      <Notice tone="info">
        No payment method is available yet. Please contact support.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <span className="mb-2 block text-xs font-semibold tracking-wide text-slate-300">
          PAYMENT METHOD
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gateways.map((g) => {
            const active = g.id === selectedId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setSelectedId(g.id);
                  if (!g.currencies.includes(currency)) setCurrency(g.currencies[0] ?? g.currency);
                }}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                  active
                    ? "border-sky-400 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                    : "border-white/10 bg-[#2b3a6e] hover:border-white/25"
                }`}
              >
                <Logo gateway={g} />
                <span className="text-xs font-semibold leading-tight">{g.name}</span>
                {g.crypto && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                    CRYPTO
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {selected && (
          <p className="mt-2 text-xs text-slate-500">
            {DRIVER_HINT[selected.driver] ?? "Follow the instructions after choosing."}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {selected && selected.currencies.length > 1 && (
          <Field label="CURRENCY">
            <select
              className={inputClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {selected.currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="AMOUNT"
          hint={`Between ${railMin} and ${railMax.toLocaleString()} ${currency}`}
        >
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
      </div>

      {error && <Notice>{error}</Notice>}

      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Starting…" : `Deposit ${selected?.name ?? ""}`}
      </Button>
      <button
        type="button"
        onClick={() => router.push("/deposit/history")}
        className="ml-3 text-sm text-sky-400 hover:underline"
      >
        View deposit history →
      </button>
    </form>
  );
}