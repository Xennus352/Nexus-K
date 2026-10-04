"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
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

/**
 * The screenshot picker.
 *
 * The native `<input type="file">` was hidden behind a styled label, which left
 * the browser's own "Choose File / No file chosen" text visible next to it — the
 * one piece of the control nobody can style, and on this form it sat directly
 * above the submit button the player has to press anyway.
 *
 * The input is kept, visually hidden and still the real control, so keyboard
 * focus, the OS file dialog and form semantics are unchanged. Everything the
 * player touches is a button that opens it.
 */
function SlipPicker({
  file,
  preview,
  error,
  onPick,
  onClear,
}: {
  file: File | null;
  /** Object URL for `file`, or null when there is nothing to show yet. */
  preview: string | null;
  error: string;
  onPick: (f: File | null) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    onPick(e.target.files?.[0] ?? null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onChange}
        // Hidden from sight and from the tab order: the button below is the
        // affordance and is what focus lands on instead.
        className="sr-only"
        data-testid="slip-input"
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected transfer screenshot"
              className="h-16 w-16 shrink-0 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-slate-600"
            >
              <ImagePlus className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-slate-100">{file.name}</div>
            <div className="text-[11px] text-emerald-300">
              {(file.size / 1024).toFixed(0)} KB · ready to send
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            data-testid="slip-clear"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" /> Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          data-testid="slip-dropzone"
          className={`group flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
            error
              ? "border-rose-400/60 bg-rose-950/20"
              : "border-white/15 bg-black/20 hover:border-sky-400/60 hover:bg-sky-500/5"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 text-sky-300 transition group-hover:scale-110 group-hover:bg-sky-500/25">
            <ImagePlus className="h-6 w-6" />
          </span>
          <span className="text-sm font-bold text-slate-100">
            Tap to choose your screenshot
          </span>
          <span className="text-[11px] text-slate-400">
            PNG, JPEG, WebP or GIF · up to {MAX_MB} MB
          </span>
        </button>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
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

  /**
   * The preview URL, alongside the file it was made from.
   *
   * Created in `chooseFile` rather than derived in an effect. An effect version
   * renders once with no preview and again with one, and its cleanup revokes the
   * *previous* URL after React has already committed the new one — so which URL is
   * live becomes two pieces of state that can disagree. Here it is one value,
   * replaced and revoked in the same step.
   *
   * The URL is pinned in a ref because the revoke on unmount happens in an effect
   * that cannot read fresh state; a player who attaches several screenshots
   * would otherwise leak every one of them for the life of the tab, and a 5 MB
   * photo times a few attempts is enough to matter on a phone.
   */
  const [preview, setPreview] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const railMin = Math.max(min, selected?.minAmount ?? min);
  const railMax = Math.min(max, selected?.maxAmount ?? max);
  // A manual rail is the only case where the player is the one moving money, so
  // it is the only case where a screenshot is the evidence.
  const manual = selected?.driver === "manual";

  /** Drops the current file and releases its preview. */
  function clearFile() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
    setFile(null);
    setPreview(null);
  }

  function chooseFile(next: File | null) {
    setFileError("");
    if (!next) {
      clearFile();
      return;
    }
    // The server sniffs magic bytes regardless; this is here so a player finds out
    // from a wrong file rather than after uploading several megabytes of it.
    if (!isSlipMime(next.type)) {
      clearFile();
      setFileError("That file is not a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (next.size > MAX_SLIP_BYTES) {
      clearFile();
      setFileError(`Screenshot must be under ${MAX_MB} MB.`);
      return;
    }
    // Release the previous preview before replacing it, or every rejected pick
    // leaks the one it discarded.
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(next);
    previewUrl.current = url;
    setFile(next);
    setPreview(url);
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
        No payment method is available yet. Please check back shortly.
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
        <div className="grid gap-3 sm:grid-cols-2">
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
                data-testid={`rail-${g.alias}`}
                className={`group flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  active
                    ? "border-sky-400 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                    : "border-white/10 bg-[#2b3a6e] hover:-translate-y-0.5 hover:border-white/25"
                }`}
              >
                {/* Wide box: the rail marks are 320x96 wordmarks, and a square
                    thumbnail shrinks a wordmark to an unreadable smudge. */}
                <Logo gateway={g} className="h-10 w-20" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight">{g.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {g.crypto ? "Cryptocurrency" : `${g.currency} · manual transfer`}
                  </span>
                </span>
                {/* A radio, drawn: the field is a button, so the selected state has
                    to be visible somewhere other than the border colour. */}
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    active ? "border-sky-400" : "border-white/25 group-hover:border-white/50"
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />}
                </span>
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
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Transfer to
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Send the amount above to this number, then attach the screenshot below.
          </p>
          <ul className="space-y-2">
            {selected.rails.map((rail, i) => (
              <li
                key={`${rail.label}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-3"
              >
                {rail.art && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rail.art}
                    alt=""
                    aria-hidden
                    className="h-9 w-16 shrink-0 rounded-md bg-white/95 object-contain"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">
                    {rail.label}
                  </div>
                  {/* break-all, not truncate: a phone number is the one value here
                      that must never be cut off, or the copy button copies a
                      fragment of it. */}
                  <div
                    data-testid="rail-number"
                    className="break-all font-mono text-lg font-bold tracking-wide text-slate-100"
                  >
                    {rail.value.trim() === "" ? (
                      <span className="font-sans text-sm font-semibold text-amber-300">
                        Not configured yet — please check back shortly.
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
          hint="An operator cannot match your transfer to your deposit without it."
        >
          <SlipPicker
            file={file}
            preview={preview}
            error={fileError}
            onPick={chooseFile}
            onClear={() => {
              clearFile();
              setFileError("");
              // Cleared so re-picking the *same* file still fires a change event;
              // otherwise the input keeps its value and onChange never runs again.
              const el = document.querySelector<HTMLInputElement>('[data-testid="slip-input"]');
              if (el) el.value = "";
            }}
          />
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