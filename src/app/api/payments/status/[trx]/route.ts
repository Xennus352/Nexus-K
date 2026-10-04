// Deposit status polling.
//
//   GET /api/payments/status/:trx
//
// A player who closes the gateway tab would otherwise wait forever for a webhook
// that already fired. This re-checks the provider (for crypto rails) and settles
// if the provider says the money landed — going through the same idempotent
// settleDeposit path as the webhook, so polling and callbacks can interleave
// freely.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { driverFor, readConfig } from "@/lib/payments/driver";
import { fetchPaymentStatus } from "@/lib/payments/nowpayments";
import { settleDeposit } from "@/lib/settle";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/payments/status/[trx]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { trx } = await ctx.params;
  const deposit = await prisma.deposit.findUnique({
    where: { trx: decodeURIComponent(trx) },
    include: { gateway: true },
  });
  if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });

  // A deposit trx is only ever visible to the player who opened it.
  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user || deposit.userId !== user.id) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }

  if (deposit.status === "pending" && deposit.gateway?.driver === "nowpayments") {
    const config = readConfig(deposit.gateway.config);
    const live = await fetchPaymentStatus(config, deposit.reference);
    if (live) {
      // `finished` also covers partial payments, so require the full amount
      // before crediting; short payments stay pending for an operator.
      if (live.status === "success" && live.actuallyPaid + 1e-8 >= deposit.amount) {
        await settleDeposit(deposit.id, { reference: deposit.reference });
      } else if (live.status === "cancel") {
        await prisma.deposit.updateMany({
          where: { id: deposit.id, status: "pending" },
          data: { status: "cancel", adminNote: "Expired at the payment provider" },
        });
      }
    }
  } else if (deposit.status === "pending" && deposit.gateway) {
    // Stripe/PayPal only settle by callback, but nudging the provider catches a
    // webhook that was dropped in transit.
    const driver = driverFor(deposit.gateway);
    if (driver?.id === "paypal" && deposit.reference) {
      const { captureOrder } = await import("@/lib/payments/paypal");
      await captureOrder(readConfig(deposit.gateway.config), deposit.reference);
    }
  }

  const fresh = await prisma.deposit.findUnique({ where: { id: deposit.id } });
  return NextResponse.json({
    trx: fresh?.trx,
    status: fresh?.status,
    coins: fresh?.coins,
    amount: fresh?.amount,
    currency: fresh?.currency,
  });
}