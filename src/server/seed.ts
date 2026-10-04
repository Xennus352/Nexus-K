// First-run bootstrap: default settings, the four payment rails this app can
// actually drive, payout methods, and the back-office account.
//
// Idempotent — safe to run on every deploy. Run with:
//
//   pnpm db:seed
//
// The engine admin credentials are NOT seeded here; they belong to the Go
// process in /engine and come from SLOTOPOL_ADMIN_EMAIL / SLOTOPOL_ADMIN_SECRET.

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SETTING_DEFS } from "@/lib/settings";

/**
 * Logo paths come from the Laravel dump's gateway art, written by
 * scripts/optimize-upload-code.sh under a slug of the *display name* that dump
 * used ("Stripe Checkout" → stripe-checkout.webp) — which is not the alias this
 * app stores ("StripeV3"), so the mapping is explicit.
 */
const LOGOS: Record<string, string> = {
  StripeV3: "/gfx/gateways/stripe-checkout.webp",
  PaypalSdk: "/gfx/gateways/paypal-express.webp",
  NowPaymentsCheckout: "/gfx/gateways/now-payments-checkout.webp",
  Skrill: "/gfx/gateways/skrill.webp",
  PerfectMoney: "/gfx/gateways/perfect-money.webp",
  Payeer: "/gfx/gateways/payeer.webp",
};

type SeedGateway = {
  alias: string;
  name: string;
  driver: "manual" | "stripe" | "paypal" | "nowpayments";
  currency: string;
  currencies: string[];
  crypto?: boolean;
  minAmount: number;
  maxAmount: number;
  percentFee: number;
  status: boolean;
  /** Falls back to the dumped art for this alias. */
  logo?: string;
  instructions?: string;
  rails?: { label: string; value: string; art?: string }[];
};

const GATEWAYS: SeedGateway[] = [
  {
    alias: "Manual",
    name: "Bank Transfer / E-Wallet",
    driver: "manual",
    currency: "USD",
    currencies: ["USD", "EUR", "GBP", "INR", "NGN", "BRL", "PHP", "PKR", "BDT", "THB", "VND"],
    minAmount: 10,
    maxAmount: 50000,
    percentFee: 0,
    status: true,
    instructions:
      "Send the exact amount using your reference number. Funds are credited once the transfer clears.",
    rails: [
      { label: "Bank", value: "Nexus-K Trust Bank · 0912 345 678 · Nexus-K Ltd", art: "/gfx/payments/01.webp" },
      { label: "Wire / SWIFT", value: "NEXUSK LTD · BIC NXKGB2L · Sort 20-00-00", art: "/gfx/payments/06.webp" },
      { label: "E-Wallet", value: "Wallet ID must match your registered email", art: "/gfx/payments/12.webp" },
    ],
  },
  {
    alias: "StripeV3",
    name: "Card (Stripe)",
    driver: "stripe",
    currency: "USD",
    currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "NZD", "SGD", "HKD", "JPY", "MXN", "INR", "BRL"],
    minAmount: 5,
    maxAmount: 100000,
    percentFee: 0,
    status: false,
  },
  {
    alias: "PaypalSdk",
    name: "PayPal",
    driver: "paypal",
    currency: "USD",
    currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CHF", "SEK", "NOK", "DKK", "PLN", "HUF", "CZK", "MXN", "BRL", "MYR", "SGD", "HKD", "NZD", "PHP", "TWD", "ILS", "RUB", "INR", "THB", "IDR", "VND"],
    minAmount: 5,
    maxAmount: 100000,
    percentFee: 0,
    status: false,
  },
  {
    alias: "NowPaymentsCheckout",
    name: "Crypto (NOWPayments)",
    driver: "nowpayments",
    currency: "USDT",
    currencies: ["USD", "EUR", "GBP"],
    crypto: true,
    minAmount: 20,
    maxAmount: 20000,
    percentFee: 0,
    status: false,
  },
  {
    // Present so the back office shows the full catalogue of the source app.
    // No driver: enabling it will not offer the rail to players.
    alias: "Skrill",
    name: "Skrill",
    driver: "manual",
    currency: "USD",
    currencies: ["USD", "EUR", "GBP"],
    minAmount: 10,
    maxAmount: 50000,
    percentFee: 0,
    status: false,
  },
  {
    alias: "PerfectMoney",
    name: "Perfect Money",
    driver: "manual",
    currency: "USD",
    currencies: ["USD", "EUR"],
    minAmount: 10,
    maxAmount: 50000,
    percentFee: 0,
    status: false,
  },
  {
    alias: "Payeer",
    name: "Payeer",
    driver: "manual",
    currency: "USD",
    currencies: ["USD", "EUR", "RUB"],
    minAmount: 10,
    maxAmount: 50000,
    percentFee: 0,
    status: false,
  },
];

const WITHDRAW_METHODS = [
  {
    name: "Bank Account",
    code: "bank",
    logo: "/gfx/payments/01.webp",
    currency: "USD",
    minAmount: 20,
    maxAmount: 30000,
    percentFee: 0,
    fixedFee: 1,
    fields: [
      { key: "accountName", label: "Account holder name", type: "text" },
      { key: "accountNumber", label: "Account / IBAN", type: "text" },
      { key: "bankName", label: "Bank name", type: "text" },
      { key: "swift", label: "SWIFT / BIC", type: "text", optional: true },
    ],
  },
  {
    name: "E-Wallet",
    code: "ewallet",
    logo: "/gfx/payments/12.webp",
    currency: "USD",
    minAmount: 10,
    maxAmount: 20000,
    percentFee: 1,
    fixedFee: 0.5,
    fields: [
      { key: "accountName", label: "Wallet holder name", type: "text" },
      { key: "walletId", label: "Wallet ID / phone number", type: "text" },
      { key: "provider", label: "Provider", type: "text" },
    ],
  },
  {
    name: "USDT (TRC-20)",
    code: "usdt-trc20",
    logo: "/gfx/payments/16.webp",
    currency: "USDT",
    minAmount: 20,
    maxAmount: 25000,
    percentFee: 0,
    fixedFee: 1,
    fields: [
      { key: "accountName", label: "Network name", type: "text" },
      { key: "address", label: "TRC-20 address", type: "text" },
    ],
  },
  {
    name: "Bitcoin",
    code: "btc",
    logo: "/gfx/payments/08.webp",
    currency: "BTC",
    minAmount: 0.001,
    maxAmount: 1.5,
    percentFee: 0,
    fixedFee: 0,
    fields: [
      { key: "accountName", label: "Wallet label", type: "text" },
      { key: "address", label: "BTC address", type: "text" },
    ],
  },
];

async function main() {
  /* ------------------------------------------------------------- settings */
  for (const d of SETTING_DEFS) {
    await prisma.setting.upsert({
      where: { key: d.key },
      update: {}, // never clobber an operator's change
      create: { key: d.key, value: d.value, group: d.group, label: d.label, type: d.type },
    });
  }
  console.log(`settings: ${SETTING_DEFS.length}`);

  /* ------------------------------------------------------------- gateways */
  for (const [i, g] of GATEWAYS.entries()) {
    await prisma.gateway.upsert({
      where: { alias: g.alias },
      update: {}, // credentials and status are operator-owned
      create: {
        alias: g.alias,
        name: g.name,
        driver: g.driver,
        logo: g.logo ?? LOGOS[g.alias] ?? "",
        currency: g.currency,
        currencies: JSON.stringify(g.currencies),
        crypto: g.crypto ?? false,
        minAmount: g.minAmount,
        maxAmount: g.maxAmount,
        percentFee: g.percentFee,
        config: "{}",
        instructions: g.instructions ?? "",
        rails: JSON.stringify(g.rails ?? []),
        status: g.status,
        sort: i,
      },
    });
  }
  console.log(`gateways: ${GATEWAYS.length}`);

  /* ------------------------------------------------------ withdraw methods */
  for (const [i, m] of WITHDRAW_METHODS.entries()) {
    await prisma.withdrawMethod.upsert({
      where: { code: m.code },
      update: {},
      create: {
        name: m.name,
        code: m.code,
        logo: m.logo,
        currency: m.currency,
        minAmount: m.minAmount,
        maxAmount: m.maxAmount,
        percentFee: m.percentFee,
        fixedFee: m.fixedFee,
        fields: JSON.stringify(m.fields),
        status: true,
        sort: i,
      },
    });
  }
  console.log(`withdraw methods: ${WITHDRAW_METHODS.length}`);

  /* -------------------------------------------------------------- backoffice */
  const email = (process.env.ADMIN_EMAIL ?? "admin@nexus-k.test").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "nexus-admin";
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    await prisma.admin.create({
      data: {
        username: process.env.ADMIN_USERNAME ?? "admin",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        name: "Back Office",
        role: "superadmin",
      },
    });
    console.log(`admin created: ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`  default password: ${password} — change it now`);
  } else {
    console.log(`admin exists: ${email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());