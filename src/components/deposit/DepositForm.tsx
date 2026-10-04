"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { MAX_SLIP_BYTES, MAX_SLIP_MB, isSlipMime } from "@/lib/slips";

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
  /** Manual rails only: the account details the player transfers to. */
  rails: { label: string; value: string; art?: string }[];
  /** Manual rails only: free text shown under the rails. */
  instructions: string;
};

const DRIVER_HINT: Record<string, string> = {
  manual: "Transfer the exact amount to the account below, then attach the screenshot.",
  stripe: "Visa, Mastercard, Apple Pay and more — you are redirected to Stripe.",
  paypal: "Pay with your PayPal balance, card or bank account.",
  nowpayments: "Send crypto to the address shown; credited once the network confirms.",
};

const MAX_MB = MAX_SLIP_MB;

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
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const railMin = Math.max(min, selected?.minAmount ?? min);
  const railMax = Math.min(max, selected?.maxAmount ?? max);
  // A manual rail is the only case where the player is the one moving money, so
  // it is the only case where a screenshot is the evidence.
  const manual = selected?.driver === "manual";

  function chooseFile(next: File | null) {
    setFileError("");
    if (!next) {
      setFile(null);
      return;
    }
    // The server sniffs magic bytes regardless; this is here so a player finds out
    // from a wrong file rather than after uploading several megabytes of it.
    if (!isSlipMime(next.type)) {
      setFile(null);
      setFileError("That file is not a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (next.size > MAX_SLIP_BYTES) {
      setFile(null);
      setFileError(`Screenshot must be under ${MAX_MB} MB.`);
      return;
    }
    setFile(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (manual && !file) {
      setFileError("Attach a screenshot of your transfer so an operator can match it.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("gatewayId", selectedId);
      body.set("currency", currency);
      body.set("amount", amount);
      if (file) body.set("slip", file);
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
      {/* The rails below carry data-copy; this mounts the delegated handler once
          for the whole page rather than giving each rail its own state. */}
      <CopyButton />
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

      {/* The account to transfer to, on the same screen as the form rather than
          one page deeper: copying a phone number and then typing an amount is the
          order every mobile payment app uses, and it is the order that leaves the
          fewest abandoned transfers. */}
      {manual && selected && selected.rails.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/15 p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            Transfer to
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Send the amount above to one of these, then attach the screenshot below.
          </p>
          <ul className="space-y-2">
            {selected.rails.map((rail, i) => (
              <li
                key={`${rail.label}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-3"
              >
                {rail.art && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rail.art} alt="" aria-hidden className="h-9 w-9 shrink-0 rounded object-contain" />
                )}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">
                    {rail.label}
                  </div>
                  {/* break-all, not truncate: a phone number is the one value here
                      that must never be cut off, or the copy button copies a
                      fragment of it. */}
                  <div className="break-all font-mono text-sm font-semibold text-slate-100">
                    {rail.value.trim() === "" ? (
                      <span className="font-sans font-semibold text-amber-300">
                        Not configured yet — please contact support.
                      </span>
                    ) : (
                      rail.value
                    )}
                  </div>
                </div>
                {/* No copy button without a value: it would put an empty string on
                    the clipboard, which reads as success and transfers nothing. */}
                {rail.value.trim() !== "" && (
                  <button
                    type="button"
                    className="ml-auto shrink-0 cursor-pointer rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                    data-copy={rail.value}
                  >
                    Copy
                  </button>
                )}
              </li>
            ))}
          </ul>
          {selected.instructions && (
            <p className="mt-3 text-xs text-slate-400">{selected.instructions}</p>
          )}
        </div>
      )}

      {manual && (
        <Field
          label="TRANSFER SCREENSHOT"
          hint={`PNG, JPEG, WebP or GIF, up to ${MAX_MB} MB. An operator cannot match your transfer without it.`}
        >
          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer text-xs text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sky-500/15 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-sky-200 transition hover:file:bg-sky-500/25"
            />
            {file && (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(file)}
                  alt="Selected transfer screenshot"
                  onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
                  className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-slate-200">{file.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Remove
                </button>
              </div>
            )}
            {fileError && <p className="text-xs font-semibold text-rose-300">{fileError}</p>}
          </div>
        </Field>
      )}

      {error && <Notice>{error}</Notice>}

      <Button type="submit" disabled={busy || (manual && !file)} className="w-full sm:w-auto">
        {busy ? "Sending…" : manual ? "Send proof of transfer" : `Deposit ${selected?.name ?? ""}`}
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