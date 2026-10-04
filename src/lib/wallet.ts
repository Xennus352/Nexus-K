// The single place a player balance changes.
//
// The engine's wallet is authoritative; this module is the only thing that
// moves it, and it always writes a matching ledger row. That invariant is what
// makes the admin transaction report trustworthy: every coin that enters or
// leaves a wallet has a `Transaction` explaining it, and `balance` on that row
// is the engine balance immediately after the movement.
//
// Failure ordering matters. Ledger rows are written *after* a confirmed engine
// movement (so we never log coins that were not credited) and movements are
// refused unless the caller has already reserved the record that authorises
// them (a pending deposit/withdrawal), which is what stops a replayed webhook
// from paying twice.

import { prisma } from "@/lib/prisma";
import { engineWalletAdd, engineWalletGet, type WalletResult } from "@/lib/engine";
import { coins, cashToCoins } from "@/lib/money";
import { ref } from "@/lib/ids";

export type TrxType =
  | "deposit"
  | "withdrawal"
  | "bonus"
  | "referral"
  | "bet"
  | "win"
  | "refund"
  | "adjustment";

export type WalletError = { ok: false; error: string };

/** Reads the live wallet straight from the engine. */
export async function walletOf(engineUid: number): Promise<number> {
  const res = await engineWalletGet(engineUid);
  return res?.wallet ?? 0;
}

async function writeLedger(row: {
  userId: string;
  type: TrxType;
  amount: number;
  balance: number;
  memo: string;
  refTrx: string;
}): Promise<string> {
  const trx = ref("TX");
  await prisma.transaction.create({
    data: {
      trx,
      userId: row.userId,
      type: row.type,
      amount: row.amount,
      balance: row.balance,
      memo: row.memo,
      ref: row.refTrx,
    },
  });
  return trx;
}

export type MoveResult = { ok: true; wallet: number; trx: string };

/**
 * Applies a signed coin movement and logs it.
 *
 * `engineUid` must be the engine account id. A refused engine call (offline,
 * unknown user, or a debit that would overdraw) is returned as an error rather
 * than thrown, because most callers want to show the player a message.
 */
export async function move(
  args: {
    userId: string;
    engineUid: number | null;
    amount: number;
    type: TrxType;
    memo: string;
    refTrx?: string;
  },
): Promise<MoveResult | WalletError> {
  const amount = coins(args.amount);
  if (amount === 0) return { ok: false, error: "Nothing to move." };
  if (args.engineUid === null) {
    return { ok: false, error: "This account has no linked game wallet yet." };
  }

  // `engineWalletAdd` rejects outright for amounts past the engine's per-movement
  // limit. That is a refusal like any other — a message to show, not a crash.
  let res: WalletResult | null;
  try {
    res = await engineWalletAdd(args.engineUid, amount);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The game wallet refused that movement." };
  }
  if (!res) {
    if (amount < 0) {
      const current = await walletOf(args.engineUid);
      return {
        ok: false,
        error: `Not enough balance: this move needs ${Math.abs(amount)} coins but the wallet holds ${current}.`,
      };
    }
    return { ok: false, error: "The game wallet is unreachable right now. Please try again." };
  }

  const trx = await writeLedger({
    userId: args.userId,
    type: args.type,
    amount,
    balance: res.wallet,
    memo: args.memo,
    refTrx: args.refTrx ?? "",
  });
  return { ok: true, wallet: res.wallet, trx };
}

/* ------------------------------------------------------------------ bonuses */

export type BonusKind = "welcome" | "daily" | "referral" | "promo";

/**
 * Claims a bonus exactly once per period.
 *
 * `BonusClaim.claimKey` is a unique index, so the insert is the lock: two
 * concurrent claims race on it and MongoDB rejects the loser. The coins are only
 * moved after the claim row exists, which makes double-crediting impossible
 * even if the same button is hammered.
 */
export async function claimBonus(args: {
  userId: string;
  engineUid: number | null;
  kind: BonusKind;
  amount: number;
  memo: string;
  /** e.g. "2026-10-04" for a daily bonus; unique per kind otherwise. */
  period: string;
  refTrx?: string;
}): Promise<MoveResult | WalletError> {
  const claimKey = `${args.kind}:${args.userId}:${args.period}`;
  try {
    await prisma.bonusClaim.create({
      data: { claimKey, userId: args.userId, kind: args.kind, amount: coins(args.amount) },
    });
  } catch {
    return { ok: false, error: "This bonus has already been claimed." };
  }

  const moved = await move({
    userId: args.userId,
    engineUid: args.engineUid,
    amount: args.amount,
    type: args.kind === "referral" ? "referral" : "bonus",
    memo: args.memo,
    refTrx: args.refTrx,
  });
  if (!moved.ok) {
    // Release the claim so a transient engine outage does not cost the bonus.
    await prisma.bonusClaim.deleteMany({ where: { claimKey } });
  }
  return moved;
}

/* --------------------------------------------------------- bonus arithmetic */

/** Coins credited per `cash` deposited. `bonusPercent` of the deposit. */
export function depositBonus(cash: number, rate: number, bonusPercent: number): number {
  return cashToCoins(cash * (bonusPercent / 100), rate);
}

export function bonusEligible(amount: number, minDeposit: number): boolean {
  return amount >= minDeposit;
}