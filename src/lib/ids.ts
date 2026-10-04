// Reference numbers and small formatting helpers shared by every money flow.
//
// Every id the player ever sees (deposit trx, withdrawal trx, ticket number,
// ledger entry, referral code) is generated here so they all look alike and are
// impossible to guess from a row count.

import { randomBytes, randomInt } from "node:crypto";

// Crockford-ish alphabet: no I, L, O, U — players retype these from SMS/bank
// receipts, so ambiguous glyphs are removed.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Cryptographically random, URL-safe token in [A-Za-z0-9]. */
export function randomToken(len = 24): string {
  return randomBytes(Math.ceil((len * 3) / 4))
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, len)
    .padEnd(len, "x");
}

/** Unambiguous uppercase code, e.g. for referral codes. */
export function randomCode(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Reference number with a short, readable prefix.
 *
 *   ref("DEP") -> "DEP-7K4M2XQ9"
 *
 * The randomInt call is rejection-sampled by Node, so there is no modulo bias —
 * important because these strings double as bearer-ish references in receipts.
 */
export function ref(prefix: string, len = 8): string {
  return `${prefix.toUpperCase()}-${randomCode(len)}`;
}

/** Sequential-looking ticket number that also stays unguessable. */
export function ticketNumber(): string {
  return ref("TKT", 6);
}