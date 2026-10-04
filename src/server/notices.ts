// The player's own money events, newest first.
//
// The rows the player already owns are the notification: a deposit that was
// approved *is* the notification that their deposit was approved. A separate
// notification store would need its own write at every settle and refund site,
// and the day one of those was missed the player would be told their deposit was
// pending forever — a bug invisible in testing, because the happy path still
// works.
//
// So this reads the deposit and withdrawal rows directly. It is a server module
// because every consumer is a server component: the layout renders it into the
// topbar bell, the account screen renders it inline, and neither needs a client
// fetch on mount to know what the player has not seen yet.

import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/money";

export type Notice = {
  /** Stable identity for the event, so React can key the list. */
  id: string;
  at: string;
  tone: "good" | "bad" | "info";
  title: string;
  body: string;
  href: string;
};

/** Rows read per side. Enough for a bell dropdown, cheap enough to poll. */
const LIMIT = 12;

/** Cap on what is returned, applied after the two sides are merged. */
const TOTAL = 20;

/**
 * The most recent money events for one account.
 *
 * `userId` is the Prisma id, not the engine uid: notifications are about rows in
 * this database, and an account that never got an engine uid still has deposits
 * worth reporting.
 */
export async function noticesFor(userId: string): Promise<Notice[]> {
  const [deposits, withdrawals, adjustments] = await Promise.all([
    prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { method: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      where: { userId, type: "adjustment", amount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
  ]);

  const notices: Notice[] = [];

  for (const d of deposits) {
    // Coins and the cash figure are quoted from the stored columns rather than
    // recomputed: they are the numbers the player was shown when they started,
    // and a recompute would drift the moment a rate setting changes.
    const cash = fmt(d.amount, d.currency);
    const rail = d.gatewayAlias || "your rail";
    notices.push(
      d.status === "success"
        ? {
            id: `dep:${d.id}`,
            at: (d.paidAt ?? d.createdAt).toISOString(),
            tone: "good",
            title: `Deposit approved · +${d.coins.toLocaleString()} coins`,
            body: `${cash} received via ${rail}.`,
            href: `/deposit/${d.trx}`,
          }
        : d.status === "cancel"
          ? {
              id: `dep:${d.id}`,
              at: d.createdAt.toISOString(),
              tone: "bad",
              title: "Deposit cancelled",
              // The operator's reason is shown verbatim: "why was my deposit
              // rejected" is the question this bell exists to answer, and an
              // empty body would send the player looking for someone to ask.
              body: d.adminNote || `${cash} via ${rail} was not accepted.`,
              href: `/deposit/${d.trx}`,
            }
          : {
              id: `dep:${d.id}`,
              at: d.createdAt.toISOString(),
              tone: "info",
              title: "Deposit awaiting confirmation",
              body: `${cash} via ${rail} is being checked. ${d.coins.toLocaleString()} coins on approval.`,
              href: `/deposit/${d.trx}`,
            },
    );
  }

  for (const w of withdrawals) {
    const cash = fmt(w.net, w.currency);
    const rail = w.method.name;
    notices.push(
      w.status === "success"
        ? {
            id: `wdl:${w.id}`,
            at: (w.paidAt ?? w.createdAt).toISOString(),
            tone: "good",
            title: `Withdrawal paid · ${cash}`,
            body: `${w.charge.toLocaleString()} coins sent to your ${rail} account.`,
            href: "/withdraw/history",
          }
        : w.status === "cancel"
          ? {
              id: `wdl:${w.id}`,
              at: w.createdAt.toISOString(),
              tone: "info",
              title: `Withdrawal cancelled · +${w.charge.toLocaleString()} coins`,
              body: w.adminNote || "The reservation was refunded to your balance.",
              href: "/withdraw/history",
            }
          : {
              id: `wdl:${w.id}`,
              at: w.createdAt.toISOString(),
              tone: "info",
              title: "Withdrawal requested",
              body: `${cash} via ${rail}. The coins are reserved until an operator pays it.`,
              href: "/withdraw/history",
            },
    );
  }

  for (const a of adjustments) {
    notices.push({
      id: `adj:${a.id}`,
      at: a.createdAt.toISOString(),
      tone: "good",
      title: `Coins granted by admin · +${a.amount.toLocaleString()}`,
      body: a.memo || "An operator credited your account.",
      href: "/account",
    });
  }

  notices.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return notices.slice(0, TOTAL);
}