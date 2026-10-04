// Deposit and withdrawal settlement.
//
// Every state change on a money record funnels through this module so the
// wallet, the totals and the ledger can never disagree — whether the change came
// from a signed provider webhook, a status poll, or an admin clicking Approve.
//
// Idempotency is the whole job here. Gateways retry webhooks, players refresh
// the status page, and admins double-click; each of those must be able to run
// this code many times and move coins at most once. The guard is a conditional
// update on the record's status: `updateMany({ where: { id, status: "pending" },
// data: { status: "success" } })` returns 1 for the caller that won the race and
// 0 for everyone after, and only the winner is allowed to touch the wallet.

import { prisma } from "@/lib/prisma";
import { cashToCoins, coinsToCash, depositFee, round } from "@/lib/money";
import { claimBonus, depositBonus, move } from "@/lib/wallet";
import { ref } from "@/lib/ids";
import { settingNumber } from "@/lib/settings";

export type SettleResult =
  | { ok: true; changed: boolean; wallet?: number }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ deposits */

export type PendingDeposit = {
  id: string;
  trx: string;
  userId: string;
  amount: number;
  fee: number;
  net: number;
  coins: number;
  currency: string;
  gatewayAlias: string;
  gatewayId: string | null;
};

/** Marks a pending deposit paid and credits the wallet. */
export async function settleDeposit(
  depositId: string,
  opts: { reference?: string; adminNote?: string } = {},
): Promise<SettleResult> {
  // 1. Claim the transition. Only one concurrent caller can win this.
  const claimed = await prisma.deposit.updateMany({
    where: { id: depositId, status: "pending" },
    data: {
      status: "success",
      paidAt: new Date(),
      ...(opts.reference ? { reference: opts.reference } : {}),
      ...(opts.adminNote ? { adminNote: opts.adminNote } : {}),
    },
  });
  if (claimed.count === 0) {
    // Already settled (or cancelled). Nothing more to do — this is the retry path.
    return { ok: true, changed: false };
  }

  const d = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!d) return { ok: false, error: "deposit vanished mid-settlement" };
  if (d.coins <= 0) return { ok: true, changed: true };

  const user = await prisma.user.findUnique({ where: { id: d.userId } });
  const moved = await move({
    userId: d.userId,
    engineUid: user?.engineUid ?? null,
    amount: d.coins,
    type: "deposit",
    memo: `Deposit ${d.trx} via ${d.gatewayAlias}`,
    refTrx: d.trx,
  });
  if (!moved.ok) {
    // The engine refused (offline, or the account lost its engine uid). Undo the
    // claim so an admin can retry, and leave the ledger untouched.
    await prisma.deposit.update({
      where: { id: d.id },
      data: { status: "pending", paidAt: null, adminNote: moved.error.slice(0, 200) },
    });
    return { ok: false, error: moved.error };
  }

  await prisma.user.update({
    where: { id: d.userId },
    data: { totalDeposit: { increment: d.amount } },
  });

  // Optional deposit-bonus top-up, applied after the deposit itself so the
  // player always sees the principal arrive first.
  const percent = await settingNumber("bonus.deposit_percent", 0);
  if (percent > 0) {
    const bonusCoins = depositBonus(d.net, 1, percent);
    if (bonusCoins > 0) {
      await claimBonus({
        userId: d.userId,
        engineUid: user?.engineUid ?? null,
        kind: "promo",
        amount: bonusCoins,
        memo: `Deposit bonus on ${d.trx}`,
        period: d.trx,
        refTrx: d.trx,
      });
    }
  }
  return { ok: true, changed: true, wallet: moved.wallet };
}

/** Cancels a pending deposit. No wallet movement: nothing was ever credited. */
export async function cancelDeposit(depositId: string, adminNote?: string): Promise<SettleResult> {
  const res = await prisma.deposit.updateMany({
    where: { id: depositId, status: "pending" },
    data: { status: "cancel", adminNote: adminNote ?? "" },
  });
  return { ok: true, changed: res.count > 0 };
}

/**
 * Creates a deposit in the pending state with its amounts already computed, so
 * the row the player sees and the coins that will be credited can never differ.
 */
export async function openDeposit(args: {
  userId: string;
  gateway: { id: string; alias: string; currency: string; rate: number; percentFee: number; fixedFee: number };
  trx: string;
  amount: number;
  currency: string;
  payUrl?: string;
  reference?: string;
  data?: Record<string, string>;
  ip?: string;
}): Promise<{ trx: string; coins: number; net: number; fee: number }> {
  const rate = args.gateway.rate > 0 ? args.gateway.rate : 1;
  const { fee, net } = depositFee(args.amount, args.gateway.percentFee, args.gateway.fixedFee, args.currency);
  const coinAmount = cashToCoins(net, rate);

  await prisma.deposit.create({
    data: {
      trx: args.trx,
      userId: args.userId,
      gatewayId: args.gateway.id,
      gatewayAlias: args.gateway.alias,
      amount: round(args.amount, args.currency),
      fee,
      net,
      coins: coinAmount,
      currency: args.currency.toUpperCase(),
      status: "pending",
      reference: args.reference ?? "",
      payUrl: args.payUrl ?? "",
      data: JSON.stringify(args.data ?? {}),
      ip: args.ip ?? "",
    },
  });
  return { trx: args.trx, coins: coinAmount, net, fee };
}

/* --------------------------------------------------------------- withdrawals */

export type PayoutDetails = Record<string, string>;

/**
 * Opens a withdrawal request and immediately debits the wallet.
 *
 * The debit happens up front (rather than on approval) because the coins must
 * leave the play balance the moment the player requests them — otherwise they
 * could request five payouts for one balance. A cancelled request refunds the
 * coins in `cancelWithdrawal`.
 */
export async function openWithdrawal(args: {
  userId: string;
  method: { id: string; name: string; code: string; currency: string; rate: number; percentFee: number; fixedFee: number };
  trx: string;
  amount: number;
  currency: string;
  details: PayoutDetails;
  accountName: string;
}): Promise<SettleResult & { wallet?: number; net?: number; fee?: number }> {
  const rate = args.method.rate > 0 ? args.method.rate : 1;
  // The player asks for `amount` in coins; the rails pay `net` in cash after the
  // fee, and the wallet is debited `amount + fee`.
  const fee = round((args.amount * args.method.percentFee) / 100 + args.method.fixedFee, args.currency);
  const charge = round(args.amount + fee, args.currency);
  const net = coinsToCash(args.amount, rate, args.currency);

  const user = await prisma.user.findUnique({ where: { id: args.userId } });
  const moved = await move({
    userId: args.userId,
    engineUid: user?.engineUid ?? null,
    amount: -charge,
    type: "withdrawal",
    memo: `Withdrawal ${args.trx} via ${args.method.name}`,
    refTrx: args.trx,
  });
  if (!moved.ok) return { ok: false, error: moved.error };

  await prisma.withdrawal.create({
    data: {
      trx: args.trx,
      userId: args.userId,
      methodId: args.method.id,
      account: JSON.stringify(args.details),
      accountName: args.accountName,
      amount: args.amount,
      fee,
      charge,
      net,
      currency: args.currency.toUpperCase(),
      status: "pending",
    },
  });
  // `net` and `fee` come back so the caller can tell an operator how much cash to
  // send without recomputing the rate — the alert that reaches Telegram is the
  // only place the real figure appears before the back office is opened.
  return { ok: true, changed: true, wallet: moved.wallet, net, fee };
}

/** Marks a withdrawal paid out. The wallet was already debited on request. */
export async function payWithdrawal(
  withdrawalId: string,
  adminNote?: string,
): Promise<SettleResult> {
  const res = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "pending" },
    data: { status: "success", paidAt: new Date(), adminNote: adminNote ?? "" },
  });
  if (res.count === 0) return { ok: true, changed: false };
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (w) {
    await prisma.user.update({
      where: { id: w.userId },
      data: { totalWithdraw: { increment: coinsToCash(w.amount, 1, w.currency) } },
    });
  }
  return { ok: true, changed: true };
}

/** Cancels a withdrawal and refunds the coins taken at request time. */
export async function cancelWithdrawal(
  withdrawalId: string,
  adminNote?: string,
): Promise<SettleResult> {
  const claimed = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "pending" },
    data: { status: "cancel", adminNote: adminNote ?? "" },
  });
  if (claimed.count === 0) return { ok: true, changed: false };

  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) return { ok: true, changed: true };

  const user = await prisma.user.findUnique({ where: { id: w.userId } });
  const refund = await move({
    userId: w.userId,
    engineUid: user?.engineUid ?? null,
    amount: w.charge,
    type: "refund",
    memo: `Withdrawal ${w.trx} cancelled — refunded`,
    refTrx: w.trx,
  });
  if (!refund.ok) return { ok: false, error: refund.error };
  return { ok: true, changed: true, wallet: refund.wallet };
}

/* ------------------------------------------------------------- ledger helpers */

/** Records a purely bookkeeping entry (no wallet movement). */
export async function noteTransaction(args: {
  userId: string;
  type: "deposit" | "withdrawal" | "bonus" | "referral" | "bet" | "win" | "refund" | "adjustment";
  amount: number;
  balance: number;
  memo: string;
  ref?: string;
}): Promise<void> {
  await prisma.transaction.create({
    data: {
      trx: ref("TX"),
      userId: args.userId,
      type: args.type,
      amount: args.amount,
      balance: args.balance,
      memo: args.memo,
      ref: args.ref ?? "",
    },
  });
}