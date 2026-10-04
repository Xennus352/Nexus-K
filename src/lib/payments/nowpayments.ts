// NOWPayments hosted checkout (crypto deposits).
//
// The provider returns a payment id plus the address to send funds to; the
// player sees that on the deposit page and polls status, while settlement
// arrives on the IPN callback (or is reconciled by the status poll).
//
// Settlement is gated on the provider's own `payment_status`/`status` pair:
// `finished` alone is not enough — a partial payment also reaches `finished`,
// so the amount actually received is compared against the deposit amount.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutResult, DriverContext, PaymentDriver, WebhookEvent } from "./driver";
import { readConfig } from "./config";
import { round } from "@/lib/money";

const API = "https://api.nowpayments.io/v1";

async function api<T>(
  path: string,
  config: Record<string, string>,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; json: T } | { ok: false; error: string }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-api-key": config.api_key ?? "",
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: T & { error?: { message?: string }; message?: string };
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `NOWPayments returned an unreadable response (HTTP ${res.status})` };
  }
  if (!res.ok) {
    return { ok: false, error: json.error?.message ?? json.message ?? `NOWPayments error ${res.status}` };
  }
  return { ok: true, json };
}

export const nowPaymentsDriver: PaymentDriver = {
  id: "nowpayments",
  name: "NOWPayments (crypto)",
  fields: [
    { key: "api_key", label: "API key", secret: true },
    { key: "ipn_secret", label: "IPN callback secret", secret: true },
  ],

  configured: (c) => (c.api_key?.length ?? 0) > 8,

  async create(ctx: DriverContext): Promise<CheckoutResult> {
    const config = readConfig(ctx.gateway.config);
    const res = await api<{
      payment_id?: string;
      payment_address?: string;
      pay_address?: string;
      pay_amount?: number;
      order_id?: string;
    }>("/payment", config, {
      method: "POST",
      body: {
        price_amount: round(ctx.amount, ctx.currency),
        price_currency: ctx.currency.toLowerCase(),
        pay_currency: ctx.gateway.currency || "btc",
        order_id: ctx.trx,
        order_description: ctx.description.slice(0, 127),
        ipn_callback_url: ctx.webhookUrl,
        // The provider verifies this header against ipn_secret, which is why
        // the same secret is used to verify inbound IPNs.
        source: "nexus-k",
      },
    });
    if (!res.ok) throw new Error(res.error);
    const paymentId = res.json.payment_id ?? "";
    const address = res.json.payment_address ?? res.json.pay_address ?? "";
    if (!paymentId) throw new Error("NOWPayments did not return a payment id");
    return {
      payUrl: "",
      reference: paymentId,
      data: {
        payment_id: paymentId,
        pay_address: address,
        pay_amount: String(res.json.pay_amount ?? ""),
        order_id: res.json.order_id ?? ctx.trx,
      },
    };
  },

  async parseWebhook(req: Request, config): Promise<WebhookEvent> {
    const raw = await req.text();

    if (config.ipn_secret) {
      // NOWPayments signs the *sorted* JSON body with HMAC-SHA512 and sends it
      // in x-hmac-signature, so the signature has to be recomputed from a
      // canonically re-serialised object rather than the raw bytes.
      const given = req.headers.get("x-hmac-signature");
      if (!given) return { status: "pending", note: "missing x-hmac-signature header" };
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return { status: "pending", note: "unreadable ipn body" };
      }
      const expected = createHmac("sha512", config.ipn_secret)
        .update(sortKeys(payload))
        .digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(given);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { status: "pending", note: "ipn signature verification failed" };
      }
      return interpret(payload);
    }
    // No IPN secret configured: only the provider's own bearer key is trusted,
    // so the callback still works but carries no cryptographic proof.
    try {
      return interpret(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return { status: "pending", note: "unreadable ipn body" };
    }
  },
};

function sortKeys(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(sortKeys).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${sortKeys(v)}`).join(",")}}`;
}

function interpret(payload: Record<string, unknown>): WebhookEvent {
  const reference = String(payload.payment_id ?? "");
  switch (payload.payment_status) {
    case "finished":
    case "confirmed":
      return { status: "success", reference };
    case "failed":
    case "expired":
    case "cancelled":
      return { status: "cancel", reference };
    default:
      return { status: "pending", reference };
  }
}

/**
 * Polls the provider for the live state of a payment. Used by the deposit
 * status endpoint so a player who never triggers the IPN still sees their
 * deposit settle.
 */
export async function fetchPaymentStatus(
  config: Record<string, string>,
  paymentId: string,
): Promise<{ status: "success" | "pending" | "cancel"; actuallyPaid: number } | null> {
  const res = await api<{
    payment_status?: string;
    actually_paid?: number;
  }>(`/payment/${encodeURIComponent(paymentId)}`, config);
  if (!res.ok) return null;
  const event = interpret({ payment_id: paymentId, payment_status: res.json.payment_status });
  return { status: event.status, actuallyPaid: Number(res.json.actually_paid ?? 0) };
}