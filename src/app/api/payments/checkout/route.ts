// Deposit checkout: opens a pending deposit and hands the player to the rail.
//
//   POST /api/payments/checkout
//
// This is the only place a Deposit row is created from the player side, so the
// amount validation, the fee split and the coins-to-be-credited are all decided
// here, once, before any provider is contacted.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { driverFor, readArray, readConfig } from "@/lib/payments/driver";
import { gatewayCurrencies } from "@/lib/gateways";
import { openDeposit } from "@/lib/settle";
import { parseAmount } from "@/lib/money";
import { setting, settingNumber } from "@/lib/settings";
import { ref } from "@/lib/ids";
import { publicUrl } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const form = await req.formData();
  const gatewayId = String(form.get("gatewayId") ?? "");
  const currency = String(form.get("currency") ?? "").toUpperCase();
  const amount = parseAmount(String(form.get("amount") ?? ""));

  if (!gatewayId || amount === null) {
    return NextResponse.json({ error: "Choose a payment method and an amount." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (user.status !== "active") {
    return NextResponse.json({ error: "This account is not active." }, { status: 403 });
  }

  const gateway = await prisma.gateway.findUnique({ where: { id: gatewayId } });
  if (!gateway || !gateway.status) {
    return NextResponse.json({ error: "That payment method is unavailable." }, { status: 400 });
  }
  const driver = driverFor(gateway);
  if (!driver || !driver.configured(readConfig(gateway.config))) {
    return NextResponse.json(
      { error: "That payment method is not available right now." },
      { status: 400 },
    );
  }

  /* ------------------------------------------------------------- validation */
  const railCurrency = currency || gateway.currency.toUpperCase();
  const offered = gatewayCurrencies({
    currencies: readArray<string>(gateway.currencies),
    currency: gateway.currency,
  });
  if (!offered.includes(railCurrency)) {
    return NextResponse.json({ error: "That currency is not supported here." }, { status: 400 });
  }

  // Both the global limits and the rail's own limits apply; the tighter wins.
  const min = Math.max(gateway.minAmount, await settingNumber("deposit.min", 5));
  const max = Math.min(gateway.maxAmount, await settingNumber("deposit.max", 100000));
  if (amount < min || amount > max) {
    return NextResponse.json(
      { error: `Amount must be between ${min} and ${max} ${railCurrency}.` },
      { status: 400 },
    );
  }

  /* --------------------------------------------------------- open the deposit */
  const trx = ref("DEP");
  const opened = await openDeposit({
    userId: user.id,
    gateway: {
      id: gateway.id,
      alias: gateway.alias,
      currency: gateway.currency,
      rate: gateway.rate,
      percentFee: gateway.percentFee,
      fixedFee: gateway.fixedFee,
    },
    trx,
    amount,
    currency: railCurrency,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
  });

  const origin = await publicUrl();
  const siteName = await setting("site.name");
  try {
    const checkout = await driver.create({
      gateway,
      // The provider collects the post-fee amount; `net` is what the player pays.
      amount: opened.net,
      currency: railCurrency,
      trx,
      successUrl: `${origin}/deposit/${trx}`,
      cancelUrl: `${origin}/deposit/${trx}?cancel=1`,
      webhookUrl: `${origin}/api/payments/webhook/${gateway.driver}`,
      description: `${siteName} deposit ${trx}`,
    });

    await prisma.deposit.update({
      where: { trx },
      data: {
        payUrl: checkout.payUrl,
        reference: checkout.reference,
        data: JSON.stringify(checkout.data),
      },
    });

    return NextResponse.json({
      ok: true,
      trx,
      coins: opened.coins,
      payUrl: checkout.payUrl,
      // Manual rails have nowhere to redirect, so the player stays on the
      // instructions page instead.
      redirect: checkout.payUrl || `/deposit/${trx}`,
    });
  } catch (err) {
    // The provider refused, so there is nothing pending for an operator to
    // clean up — drop the row rather than leaving a dead deposit behind.
    await prisma.deposit.deleteMany({ where: { trx } });
    const message =
      err instanceof Error ? err.message : "The payment provider rejected the request.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}