// Money-movement alerts to the operator's Telegram chats.
//
// Kept apart from the support notifications in lib/telegram so the wording,
// the redaction rules and the decision to include a screenshot all live in one
// place. Nothing here decides *whether* money moves — that is settle.ts, which
// has already committed by the time these are called.
//
// Nothing throws. A Telegram outage must not roll back a withdrawal the player
// has already been charged for, and it must not turn a successful deposit into a
// failed one.

import { notifyMoney, notifyMoneyPhoto } from "@/lib/telegram";
import { fmt } from "@/lib/money";

type MoneyAlert = {
  trx: string;
  email: string;
  username?: string;
  /** Coins the player asked for (withdrawal) or will be credited (deposit). */
  amount: number;
  currency: string;
  /** Cash equivalent, for a reader who thinks in money rather than coins. */
  cash?: string;
  /**
   * The fee line, already labelled with its unit.
   *
   * A string rather than a number because the two flows do not share a unit: a
   * deposit's fee is cash taken off the transfer, a withdrawal's is coins added
   * to the debit. Passing a bare number and labelling it in the header is how one
   * of the two ends up quoting coins where the operator is reading cash.
   */
  fee?: string;
  /** Rail or payout method name. */
  method: string;
};

/**
 * Strips anything that could make the Bot API reject the whole message.
 *
 * Chat ids and usernames are the untrusted part here: a player can register with
 * a display name containing a newline and a fake `🚨` banner, so an alert is the
 * obvious place to try to spoof an operator message to the next reader. Newlines
 * collapse, and the length is capped so a long username cannot push the amount
 * out of view.
 */
function safe(value: string, max = 60): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max) || "—";
}

function header(kind: string, a: MoneyAlert): string {
  const parts = [
    `${kind} ${a.trx}`,
    `Player: ${safe(a.email)}`,
    `Amount: ${a.amount.toLocaleString()} coins${a.cash ? ` (${safe(a.cash, 40)})` : ""}`,
  ];
  if (a.fee) parts.push(`Fee: ${safe(a.fee, 40)}`);
  parts.push(`Via: ${safe(a.method)}`);
  return parts.join("\n");
}

/** A player asked to cash out. The payout details are included verbatim. */
export async function alertWithdrawal(
  a: MoneyAlert & { details: Record<string, string> },
): Promise<number> {
  const rows = Object.entries(a.details)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${safe(k, 40)}: ${safe(v, 80)}`);

  const text = [
    header("🏧 WITHDRAWAL REQUEST", a),
    rows.length > 0 ? `\nPayout details:\n${rows.join("\n")}` : "",
    "\nApprove or cancel in the back office: /admin/withdrawals",
  ].join("");

  return notifyMoney(text);
}

/**
 * A player says they have transferred and attached the screenshot.
 *
 * The caption carries the facts needed to find the money; the image itself is
 * sent separately so the operator can read it without opening anything.
 */
export async function alertDeposit(
  a: MoneyAlert,
  slip: { bytes: Buffer; filename: string; mime: string } | null,
): Promise<number> {
  const caption = [
    header("💵 DEPOSIT PROOF SUBMITTED", a),
    slip ? `\nScreenshot: ${slip.filename}` : "\nNo screenshot attached.",
    "\nApprove in the back office: /admin/deposits",
  ].join("");

  if (!slip) return notifyMoney(caption);

  const sent = await notifyMoneyPhoto(slip.bytes, slip.filename, caption);
  // Fall back to a text-only alert if sendPhoto failed everywhere, so a photo the
  // operator never receives still leaves a trace that money is waiting.
  return sent > 0 ? sent : notifyMoney(caption);
}

/** Formats a cash figure the same way the back office shows it. */
export function alertCash(amount: number, currency: string): string {
  return fmt(amount, currency);
}