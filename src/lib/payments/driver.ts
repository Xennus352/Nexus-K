// Payment drivers.
//
// The Laravel dump in public/Upload_Code ships 30+ PHP gateway SDKs. Most of
// them are per-country PSPs (bKash, Aamarpay, SslCommerz, Cashmaal…) that need a
// merchant account contracted with that specific provider, so wiring them all
// here would produce a deploy full of dead buttons.
//
// Instead each driver implements a small HTTP contract. A rail is only offered
// on the deposit page when `configured()` says it has the credentials it needs,
// so an admin who fills in keys sees the rail appear, and one who does not never
// surfaces a broken button.
//
// Drivers:
//   manual      — instructions + admin approval (bank transfer, e-wallet)
//   stripe      — Stripe Checkout Sessions
//   paypal      — PayPal Orders v2
//   nowpayments — NOWPayments hosted checkout (crypto)

import type { Gateway } from "@/generated/prisma/client";
import { manualDriver } from "./manual";
import { stripeDriver } from "./stripe";
import { paypalDriver } from "./paypal";
import { nowPaymentsDriver } from "./nowpayments";

export type DriverContext = {
  gateway: Gateway;
  /** Amount in the gateway's own currency. */
  amount: number;
  currency: string;
  /** Our reference for the deposit; the player quotes it on the receipt. */
  trx: string;
  /** Where the gateway sends the player back to. */
  successUrl: string;
  cancelUrl: string;
  /** Where the gateway posts its signed notification. */
  webhookUrl: string;
  /** Label shown to the player on the gateway's own screen. */
  description: string;
};

export type CheckoutResult = {
  /** Where to send the player. Empty for manual rails (no redirect). */
  payUrl: string;
  /** Provider-side payment id, used to match the callback. */
  reference: string;
  /** Opaque provider payload persisted with the deposit (addresses, order ids). */
  data: Record<string, string>;
};

export type WebhookEvent =
  | { status: "success"; reference?: string; note?: string }
  | { status: "pending"; reference?: string; note?: string }
  | { status: "cancel"; reference?: string; note?: string };

export type PaymentDriver = {
  id: string;
  name: string;
  /** Credential list shown by the admin gateway editor. */
  fields: { key: string; label: string; secret?: boolean }[];
  /** True when the stored config holds everything this driver needs. */
  configured(config: Record<string, string>): boolean;
  /** Creates the provider-side payment and returns where to send the player. */
  create(ctx: DriverContext): Promise<CheckoutResult>;
  /** Validates and interprets a provider callback. */
  parseWebhook(req: Request, config: Record<string, string>): Promise<WebhookEvent>;
};

const DRIVERS: Record<string, PaymentDriver> = {
  manual: manualDriver,
  stripe: stripeDriver,
  paypal: paypalDriver,
  nowpayments: nowPaymentsDriver,
};

export function driverFor(gateway: { driver: string }): PaymentDriver | null {
  return DRIVERS[gateway.driver] ?? null;
}

export function allDrivers(): PaymentDriver[] {
  return Object.values(DRIVERS);
}

export function driverIds(): string[] {
  return Object.keys(DRIVERS);
}

export function driverName(driver: string): string {
  return DRIVERS[driver]?.name ?? driver;
}

export { readConfig, writeConfig, readArray } from "./config";