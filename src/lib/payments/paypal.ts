// PayPal Orders v2.
//
// Create an order with the capture intent, have the player approve it on
// PayPal's site, then capture. Capture is what actually moves the money, so a
// bare APPROVED event never marks a deposit paid — the webhook route captures
// first and the resulting PAYMENT.CAPTURE.COMPLETED is what settles it.

import { X509Certificate, verify } from "node:crypto";
import type { CheckoutResult, DriverContext, PaymentDriver, WebhookEvent } from "./driver";
import { readConfig } from "./config";
import { money } from "@/lib/money";

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

type Token = { access_token?: string; error_description?: string };

async function accessToken(config: Record<string, string>): Promise<string> {
  const host = hostFor(config);
  const res = await fetch(`${host}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Token;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? `PayPal auth failed (HTTP ${res.status})`);
  }
  return json.access_token;
}

function hostFor(config: Record<string, string>): string {
  return config.mode === "sandbox" ? SANDBOX : LIVE;
}

/**
 * PayPal signs `transmission_id|transmission_time|webhook_id|raw_body` with
 * SHA-1 using a certificate whose public key is published at `paypal-cert-url`.
 * The cert host is pinned to PayPal's domains, otherwise an attacker could point
 * us at their own key and forge a settlement webhook.
 */
async function verifySignature(
  req: Request,
  raw: string,
  config: Record<string, string>,
): Promise<boolean> {
  if (!config.webhook_id) return false;
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const signature = req.headers.get("paypal-transmission-sig");
  if (!transmissionId || !transmissionTime || !certUrl || !signature) return false;
  if (!/^https:\/\/api(-m)?(\.sandbox)?\.paypal\.com\//.test(certUrl)) return false;

  const certRes = await fetch(certUrl, { cache: "no-store" });
  if (!certRes.ok) return false;
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(await certRes.text());
  } catch {
    return false;
  }

  const message = [transmissionId, transmissionTime, config.webhook_id, raw].join("|");
  try {
    return verify("sha1", Buffer.from(message, "utf8"), cert.publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export const paypalDriver: PaymentDriver = {
  id: "paypal",
  name: "PayPal",
  fields: [
    { key: "client_id", label: "Client ID" },
    { key: "client_secret", label: "Client secret", secret: true },
    { key: "webhook_id", label: "Webhook ID (from the PayPal dashboard)", secret: true },
    { key: "mode", label: "Mode (live or sandbox)" },
  ],

  configured: (c) => Boolean(c.client_id && c.client_secret),

  async create(ctx: DriverContext): Promise<CheckoutResult> {
    const config = readConfig(ctx.gateway.config);
    const host = hostFor(config);
    const token = await accessToken(config);

    const res = await fetch(`${host}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Idempotency key: a retried request returns the same order instead of
        // creating a second payable order for one deposit.
        "PayPal-Request-Id": ctx.trx,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: ctx.trx,
            custom_id: ctx.trx,
            description: ctx.description.slice(0, 127),
            amount: { currency_code: ctx.currency, value: money(ctx.amount, ctx.currency) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              return_url: ctx.successUrl,
              cancel_url: ctx.cancelUrl,
            },
          },
        },
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      links?: { rel: string; href: string }[];
      message?: string;
    };
    if (!res.ok || !json.id) {
      throw new Error(json.message ?? `PayPal rejected the order (HTTP ${res.status})`);
    }
    const approve = json.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!approve) throw new Error("PayPal returned an order with no approval link");
    return { payUrl: approve, reference: json.id, data: { order_id: json.id, approve_url: approve } };
  },

  async parseWebhook(req: Request, config): Promise<WebhookEvent> {
    const raw = await req.text();
    if (!(await verifySignature(req, raw, config))) {
      return { status: "pending", note: "paypal webhook signature verification failed" };
    }

    let event: {
      event_type?: string;
      resource?: { id?: string; custom_id?: string };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      return { status: "pending", note: "unreadable paypal event body" };
    }

    const reference = event.resource?.id ?? "";
    const trx = event.resource?.custom_id ?? "";
    switch (event.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
        // Approved is not captured. The webhook route calls captureOrder() and
        // only the follow-up CAPTURE.COMPLETED event settles the deposit.
        return { status: "pending", reference, note: trx };
      case "PAYMENT.CAPTURE.COMPLETED":
        return { status: "success", reference, note: trx };
      case "PAYMENT.CAPTURE.DENIED":
      case "CHECKOUT.ORDER.VOIDED":
        return { status: "cancel", reference, note: trx };
      default:
        return { status: "pending", reference, note: trx };
    }
  },
};

/** Captures an approved order. True when the money actually moved. */
export async function captureOrder(
  config: Record<string, string>,
  orderId: string,
): Promise<boolean> {
  const res = await fetch(
    `${hostFor(config)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken(config)}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return false;
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  return json.status === "COMPLETED";
}