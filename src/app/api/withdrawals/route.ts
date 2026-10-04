// Withdrawal request endpoint (player session).
//
//   POST /api/withdrawals
//
// Deliberately an API route rather than a server action: the form is a client
// component with dynamic per-method fields, and an API handler gives a single
// place where every limit (global, method, turnover, KYC, wallet balance) is
// checked before coins leave the player's balance.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readArray } from "@/lib/payments/driver";
import { openWithdrawal } from "@/lib/settle";
import { alertCash, alertWithdrawal } from "@/server/money-alerts";
import { parseAmount } from "@/lib/money";
import { settingBool, settingNumber } from "@/lib/settings";
import { ref } from "@/lib/ids";

export const dynamic = "force-dynamic";

type MethodField = { key: string; label: string; type?: string; optional?: boolean };

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (user.status !== "active") {
    return NextResponse.json({ error: "This account is not active." }, { status: 403 });
  }

  const form = await req.formData();
  const methodId = String(form.get("methodId") ?? "");
  const amount = parseAmount(String(form.get("amount") ?? ""));
  if (!methodId || amount === null || amount <= 0) {
    return NextResponse.json({ error: "Choose a payout method and an amount." }, { status: 400 });
  }

  const method = await prisma.withdrawMethod.findUnique({ where: { id: methodId } });
  if (!method || !method.status) {
    return NextResponse.json({ error: "That payout method is unavailable." }, { status: 400 });
  }

  /* ---------------------------------------------------------------- limits */
  const globalMin = await settingNumber("withdraw.min", 10);
  const globalMax = await settingNumber("withdraw.max", 50000);
  const min = Math.max(method.minAmount, globalMin);
  const max = Math.min(method.maxAmount, globalMax);
  if (amount < min || amount > max) {
    return NextResponse.json(
      { error: `Amount must be between ${min} and ${max} coins.` },
      { status: 400 },
    );
  }

  /* ---------------------------------------------------------- turnover rule */
  // A withdrawal may not exceed what the player has actually wagered. Without
  // this, a signup bonus could be cashed out immediately.
  const factor = await settingNumber("withdraw.rollover", 1);
  if (factor > 0) {
    const required = user.totalDeposit * factor;
    if (user.totalBet + 1e-9 < required) {
      return NextResponse.json(
        {
          error: `You need to wager ${required.toFixed(2)} coins before withdrawing (you have wagered ${user.totalBet.toFixed(2)}).`,
        },
        { status: 400 },
      );
    }
  }

  /* -------------------------------------------------------------- kyc gate */
  if (await settingBool("kyc.required_for_withdraw", false)) {
    const kyc = await prisma.kycSubmission.findUnique({ where: { userId: user.id } });
    if (kyc?.status !== "approved") {
      return NextResponse.json(
        { error: "Your identity verification must be approved before withdrawing." },
        { status: 403 },
      );
    }
  }

  /* ------------------------------------------------- collect payout details */
  const fields = readArray<MethodField>(method.fields);
  const details: Record<string, string> = {};
  for (const f of fields) {
    const value = String(form.get(f.key) ?? "").trim().slice(0, 120);
    if (!value && !f.optional) {
      return NextResponse.json({ error: `${f.label} is required.` }, { status: 400 });
    }
    details[f.key] = value;
  }
  const accountName = details.accountName ?? "";

  /* -------------------------------------------------------------- open it */
  const trx = ref("WDL");
  const result = await openWithdrawal({
    userId: user.id,
    method: {
      id: method.id,
      name: method.name,
      code: method.code,
      currency: method.currency,
      rate: method.rate,
      percentFee: method.percentFee,
      fixedFee: method.fixedFee,
    },
    trx,
    amount,
    currency: method.currency || "USD",
    details,
    accountName,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // The coins are already reserved, so the request is real whether or not this
  // succeeds. Fire-and-forget: an operator with Telegram down still sees the row
  // in /admin/withdrawals.
  void alertWithdrawal({
    trx,
    email: user.email,
    username: user.username,
    amount,
    currency: method.currency || "USD",
    // The cash figure is `net` — what the player receives after the fee — not the
    // coin count. Quoting the coins as if they were cash is how an operator ends
    // up sending MMK 50,000 for a 50,000-coin request at the wrong rate.
    cash: alertCash(result.net ?? 0, method.currency || "USD"),
    fee: `${(result.fee ?? 0).toFixed(2)} coins charged`,
    method: method.name,
    details,
  }).catch(() => {});

  return NextResponse.json({ ok: true, trx, wallet: result.wallet });
}