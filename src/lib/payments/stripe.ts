// Stripe Checkout — a PaymentIntent rendered on Stripe's own hosted page.
//
// Server-to-server only: the session is created with the secret key and the
// browser is redirected to `session.url`, so the app never ships Stripe.js.
// Settlement arrives via the signed webhook, not the browser redirect, so a
// player closing the tab cannot lose a paid deposit.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutResult, DriverContext, PaymentDriver, WebhookEvent } from "./driver";
import { readConfig } from "./config";

const API = "https://api.stripe.com/v1";


/** Stripe's webhook scheme is `t=<unix>,v1=<hex hmac>` over `${t}.${body}`. */
function verify(raw: string, header: string, secret: string): { stamp: number; v1: string } | null {
  if (!secret) return null;
  const parts = new Map(
    header.split(",").map((piece) => {
      const i = piece.indexOf("=");
      return [piece.slice(0, i).trim(), piece.slice(i + 1).trim()] as const;
    }),
  );
  const stamp = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!v1 || !Number.isFinite(stamp)) return null;
  const expected = createHmac("sha256", secret).update(`${stamp}.${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b) ? { stamp, v1 } : null;
}

export const stripeDriver: PaymentDriver = {
  id: "stripe",
  name: "Stripe Checkout",
  fields: [
    { key: "secret_key", label: "Secret key (sk_live_… / sk_test_…)", secret: true },
    { key: "webhook_secret", label: "Webhook signing secret (whsec_…)", secret: true },
  ],

  configured: (c) => c.secret_key?.startsWith("sk_") === true,

  async create(ctx: DriverContext): Promise<CheckoutResult> {
    const { secret_key } = readConfig(ctx.gateway.config);
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${ctx.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: ctx.cancelUrl,
      "line_items[0][price_data][currency]": ctx.currency.toLowerCase(),
      // Stripe works in the currency's minor unit; JPY/KRW have none, which is
      // why this is a straight ×100 rather than going through money().
      "line_items[0][price_data][unit_amount]": String(Math.round(ctx.amount * 100)),
      "line_items[0][price_data][product_data][name]": ctx.description,
      "line_items[0][quantity]": "1",
      "payment_intent_data[description]": `${ctx.description} · ${ctx.trx}`,
      "payment_intent_data[metadata][trx]": ctx.trx,
    });

    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret_key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    });
    const text = await res.text();
    let json: { id?: string; url?: string; error?: { message?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(`Stripe returned an unreadable response (HTTP ${res.status})`);
    }
    if (!res.ok || !json.url) {
      throw new Error(json.error?.message ?? `Stripe rejected the session (HTTP ${res.status})`);
    }
    return {
      payUrl: json.url,
      reference: json.id ?? "",
      data: { session_id: json.id ?? "", session_url: json.url },
    };
  },

  async parseWebhook(req: Request, config): Promise<WebhookEvent> {
    const raw = await req.text();
    const header = req.headers.get("stripe-signature");
    if (!header) return { status: "pending", note: "missing stripe-signature header" };

    const checked = verify(raw, header, config.webhook_secret ?? "");
    if (!checked) return { status: "pending", note: "stripe signature verification failed" };
    // Replays of an old, validly-signed event are rejected on age alone.
    if (Math.abs(Date.now() / 1000 - checked.stamp) > 300) {
      return { status: "pending", note: "stripe signature timestamp outside tolerance" };
    }

    let event: {
      type?: string;
      data?: { object?: { id?: string; metadata?: { trx?: string } } };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      return { status: "pending", note: "unreadable stripe event body" };
    }

    const obj = event.data?.object;
    const ref = obj?.id ?? "";
    // The deposit trx travels in metadata; the amount is intentionally NOT read
    // back from the callback (the deposit row is the amount of record).
    const trx = obj?.metadata?.trx ?? "";

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "payment_intent.succeeded":
        return { status: "success", reference: ref, note: trx };
      case "checkout.session.expired":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        return { status: "cancel", reference: ref, note: trx };
      default:
        return { status: "pending", reference: ref, note: trx };
    }
  },
};