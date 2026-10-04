// Deposit checkout: opens a pending deposit and hands the player to the rail.
//
//   POST /api/payments/checkout
//
// This is the only place a Deposit row is created from the player side, so the
// amount validation, the fee split and the coins-to-be-credited are all decided
// here, once, before any provider is contacted.
//
// Manual rails additionally require the player to attach the screenshot of the
// transfer they just made. Nothing else can check that they did it, and an
// operator approving a deposit has nothing to compare the amount against
// otherwise. The slip is written to `var/uploads` (never `public/`) and pushed to
// the operator's Telegram chats as a photo, so the picture an operator approves
// is the same picture they saw when the alert arrived.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { driverFor, readArray, readConfig } from "@/lib/payments/driver";
import { gatewayCurrencies } from "@/lib/gateways";
import { openDeposit } from "@/lib/settle";
import { alertCash, alertDeposit } from "@/server/money-alerts";
import { deleteSlip, isRejection, readSlip, saveSlip, type SavedSlip } from "@/server/slips";
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
  const upload = form.get("slip");

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

  /* ---------------------------------------------------------------- the slip */
  // Only manual rails need proof; a Stripe or PayPal deposit arrives with the
  // provider's own signed confirmation, so asking for a screenshot there would be
  // pointless busywork.
  const manual = gateway.driver === "manual";
  let slip: SavedSlip | null = null;

  if (manual) {
    if (!(upload instanceof File) || upload.size === 0) {
      return NextResponse.json(
        { error: "Attach a screenshot of your transfer so an operator can match it." },
        { status: 400 },
      );
    }
    const saved = await saveSlip(upload);
    if (isRejection(saved)) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    slip = saved;
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

  if (slip) {
    await prisma.deposit.update({
      where: { trx },
      data: {
        slipPath: slip.stored,
        slipName: slip.originalName,
        slipType: slip.mime,
        slipAt: new Date(),
      },
    });
  }

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

    // Fire-and-forget: the deposit is open either way, and the operator sees the
    // row in /admin/deposits even with Telegram down.
    if (manual) {
      const bytes = slip ? await readSlip(slip.stored) : null;
      void alertDeposit(
        {
          trx,
          email: user.email,
          username: user.username,
          // The coins the deposit will credit, with the cash the player was told
          // to send. Both are quoted because an operator matching a bank line
          // reads the cash amount, while the back office shows the coins — and
          // they differ whenever the rail charges a fee or has a rate.
          amount: opened.coins,
          currency: railCurrency,
          cash: alertCash(opened.net, railCurrency),
          fee: opened.fee > 0 ? `${opened.fee.toFixed(2)} ${railCurrency} off the transfer` : undefined,
          method: gateway.name,
        },
        bytes && slip ? { bytes, filename: slip.originalName, mime: slip.mime } : null,
      ).catch(() => {});
    }

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
    // clean up — drop the row rather than leaving a dead deposit behind, and the
    // screenshot with it.
    await prisma.deposit.deleteMany({ where: { trx } });
    await deleteSlip(slip?.stored);
    const message =
      err instanceof Error ? err.message : "The payment provider rejected the request.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}