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
  KPay: "/gfx/payments/kpay.svg",
  Wave: "/gfx/gateways/flutterwave.webp",
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

/**
 * The receiving accounts a player transfers to.
 *
 * KPay and Wave are phone-number rails whose value is intentionally left blank
 * here: the casino's real KPay number is an operator decision, and a placeholder
 * in a rail is worse than an empty one — a player would copy it and send real
 * money to nobody. The blank is filled at render time from the
 * `deposit.receive_phone` / `deposit.receive_name` settings (see
 * `fillPhoneRails`), and the deposit page says plainly when neither is set.
 */
const GATEWAYS: SeedGateway[] = [
  {
    // A generic bank/wire rail, kept as the template for "some other way to pay".
    // It ships disabled and with no account details: the bank name, IBAN, BIC and
    // sort code it used to carry were invented, and a rail row full of invented
    // numbers is the one thing an operator is most likely to enable and leave —
    // a player would then transfer real money to an account that does not exist.
    // Turning it into a working rail means filling every field in
    // /admin/gateways, which is a deliberate act.
    alias: "Manual",
    name: "Bank Transfer / E-Wallet",
    driver: "manual",
    currency: "USD",
    currencies: ["USD", "EUR", "GBP", "INR", "NGN", "BRL", "PHP", "PKR", "BDT", "THB", "VND"],
    minAmount: 10,
    maxAmount: 50000,
    percentFee: 0,
    status: false,
    instructions: "",
    rails: [
      { label: "Bank", value: "", art: "/gfx/payments/01.webp" },
      { label: "Wire / SWIFT", value: "", art: "/gfx/payments/06.webp" },
      { label: "E-Wallet", value: "", art: "/gfx/payments/12.webp" },
    ],
  },
  {
    // KPay and Wave are the two mobile wallets most of this audience uses, and
    // both are phone-number rails: the player copies a number, opens the wallet
    // app, and sends. They ship enabled because they are the rails the operator
    // actually intends to be paid on; Stripe/PayPal ship disabled because they
    // need credentials first.
    alias: "KPay",
    name: "KPay",
    driver: "manual",
    currency: "MMK",
    currencies: ["MMK"],
    minAmount: 10,
    maxAmount: 5000000,
    percentFee: 0,
    status: true,
    instructions:
      "Open KPay, choose Transfer, enter the number below and send the exact amount. Then attach the screenshot of the confirmation here.",
    rails: [
      // Blank on purpose — see the note above the GATEWAYS array. `art` is the
      // wallet's own mark, reused from the LOGOS map so the tile and the rail
      // show the same brand.
      { label: "KPay number", value: "", art: LOGOS.KPay },
    ],
  },
  {
    alias: "Wave",
    name: "Wave",
    driver: "manual",
    currency: "MMK",
    currencies: ["MMK"],
    minAmount: 10,
    maxAmount: 5000000,
    percentFee: 0,
    status: true,
    instructions:
      "Open Wave, choose Send Money, enter the number below and send the exact amount. Then attach the screenshot of the confirmation here.",
    rails: [{ label: "Wave number", value: "", art: LOGOS.Wave }],
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
    // The two mobile wallets the operator actually pays out on. Separate from
    // the generic "E-Wallet" above because they are phone-number rails with a
    // currency of MMK rather than USD — folding them in would have meant either a
    // wrong currency or a free-text provider field the player has to guess at.
    //
    // Limits are in coins, where one coin is one MMK at the default rate, and are
    // deliberately low rather than matching a real MMK payout floor: a wallet
    // holding a few thousand coins could never request one, so the rail would be
    // offered on the form and then refuse every amount. Raise them at
    // /admin/withdraw-methods once there is enough volume to justify it.
    name: "KPay",
    code: "kpay",
    logo: "/gfx/payments/12.webp",
    currency: "MMK",
    minAmount: 20,
    maxAmount: 20000,
    percentFee: 0,
    fixedFee: 0,
    fields: [
      { key: "accountName", label: "Your KPay account name", type: "text" },
      { key: "walletId", label: "KPay number", type: "text" },
    ],
  },
  {
    name: "Wave",
    code: "wave",
    logo: "/gfx/payments/12.webp",
    currency: "MMK",
    minAmount: 20,
    maxAmount: 20000,
    percentFee: 0,
    fixedFee: 0,
    fields: [
      { key: "accountName", label: "Your Wave account name", type: "text" },
      { key: "walletId", label: "Wave number", type: "text" },
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
      // Presentation and ordering only. `status`, `config`, the amounts and
      // `rails` are deliberately absent: they are operator-owned, and a deploy
      // that re-enabled a rail or rewrote its receiving number would be worse
      // than a stale default. `logo` and `name` are the other way round — they are
      // what the player sees on the deposit page and there is nothing to
      // configure about them, so leaving a removed asset path in place would break
      // the tile rather than preserve a choice.
      update: {
        name: g.name,
        logo: g.logo ?? LOGOS[g.alias] ?? "",
        sort: i,
      },
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