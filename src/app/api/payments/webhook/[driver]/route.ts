// Provider callbacks.
//
//   POST /api/payments/webhook/:driver
//
// Unauthenticated by design — a payment provider cannot hold a session cookie.
// Trust comes from each driver's signature check plus the two invariants below:
//
//   1. A callback is matched to a deposit by the reference trx the provider
//      echoed back (Stripe metadata, PayPal custom_id, NOWPayments order_id).
//      Amounts are never used for matching, so a replayed "paid $500" event
//      cannot be applied to someone else's $20 deposit.
//   2. Settlement is idempotent. Gateways retry, so this route answers 200 even
//      for duplicates and unrecognised events to stop the retry loop; the
//      conditional update inside settleDeposit is what actually guarantees the
//      wallet is credited at most once.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { driverFor, readConfig } from "@/lib/payments/driver";
import { captureOrder } from "@/lib/payments/paypal";
import { settleDeposit } from "@/lib/settle";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

export async function POST(req: Request, ctx: RouteContext<"/api/payments/webhook/[driver]">) {
  const { driver: driverId } = await ctx.params;

  // Read the bytes once: the signature must be checked against exactly what the
  // provider sent, so the driver re-reads this same string from a probe Request.
  const raw = await req.text();
  const body = parseBody(raw);

  // Narrow to the rail this event belongs to before verifying, so the signature
  // is checked against the right credentials instead of every rail in turn.
  const candidates = await candidateGateways(driverId, eventTrx(body));

  for (const gateway of candidates) {
    const driver = driverFor(gateway);
    if (!driver) continue;

    let event;
    try {
      event = await driver.parseWebhook(
        new Request(req.url, { method: "POST", headers: req.headers, body: raw }),
        readConfig(gateway.config),
      );
    } catch {
      // A driver that throws has rejected this event (bad signature, bad body).
      continue;
    }

    const deposit = await findDeposit(gateway.id, event.note, event.reference);
    if (!deposit) {
      // Nothing to settle. Acknowledge so the provider stops retrying.
      continue;
    }

    /* --------------------------------------------------- PayPal: approve-then-capture */
    if (driver.id === "paypal" && event.status === "pending" && deposit.reference) {
      // CHECKOUT.ORDER.APPROVED is not money yet. Capture it here; the follow-up
      // PAYMENT.CAPTURE.COMPLETED event is what settles the deposit.
      const captured = await captureOrder(readConfig(gateway.config), deposit.reference);
      return NextResponse.json({ ok: true, captured });
    }

    if (event.status === "success") {
      const result = await settleDeposit(deposit.id, { reference: event.reference ?? "" });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      return NextResponse.json({ ok: true, status: "success", changed: result.changed });
    }

    if (event.status === "cancel") {
      await prisma.deposit.updateMany({
        where: { id: deposit.id, status: "pending" },
        data: { status: "cancel", adminNote: "Cancelled by the payment provider" },
      });
      return NextResponse.json({ ok: true, status: "cancel" });
    }

    return NextResponse.json({ ok: true, status: "pending" });
  }

  return NextResponse.json({ ok: true, ignored: true });
}

function parseBody(raw: string): Body {
  try {
    const json: unknown = JSON.parse(raw);
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Body) : {};
  } catch {
    return {};
  }
}

/**
 * Pulls our deposit trx out of a provider payload. Each provider stashes it in a
 * different place, and all three were set explicitly when the payment was made.
 */
function eventTrx(body: Body): string {
  const resource = (body.resource ?? {}) as Body;
  const metadata = ((body.metadata ?? resource.metadata) ?? {}) as Body;
  const candidates = [
    metadata.trx,
    body.order_id,
    body.orderId,
    body.custom_id,
    resource.custom_id,
    body.invoice_id,
    body.client_reference_id,
  ];
  for (const c of candidates) {
    const value = typeof c === "string" ? c.trim() : "";
    // Our references are always DEP-XXXXXXXX; anything else is not ours.
    if (/^DEP-[0-9A-Z]+$/.test(value)) return value;
  }
  return "";
}

/** The rails running this driver, narrowed to the one the event mentions. */
async function candidateGateways(driverId: string, trx: string) {
  if (trx) {
    const deposit = await prisma.deposit.findUnique({
      where: { trx },
      include: { gateway: true },
    });
    if (deposit?.gateway && deposit.gateway.driver === driverId) return [deposit.gateway];
  }
  return prisma.gateway.findMany({ where: { driver: driverId } });
}

type PendingDeposit = {
  id: string;
  reference: string;
  data: string;
};

/** Finds the pending deposit an event refers to: by trx, else by provider id. */
async function findDeposit(
  gatewayId: string,
  note: string | undefined,
  reference: string | undefined,
): Promise<PendingDeposit | null> {
  const trx = String(note ?? "").trim();
  if (/^DEP-[0-9A-Z]+$/.test(trx)) {
    const byTrx = await prisma.deposit.findFirst({
      where: { trx, gatewayId, status: "pending" },
      select: { id: true, reference: true, data: true },
    });
    if (byTrx) return byTrx;
  }
  if (reference) {
    return prisma.deposit.findFirst({
      where: { gatewayId, reference, status: "pending" },
      select: { id: true, reference: true, data: true },
    });
  }
  return null;
}