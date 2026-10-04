// Helpers for handing out player credentials.
//
// Passwords are never stored in the clear. `User.passwordHash` is a one-way bcrypt
// hash and the engine keeps its own secret, so an existing password cannot be read
// back — that is the point of hashing it. What the back office can do instead is
// *set* a password and show the operator the value it just set, so the credential
// sheet can be handed over or copied. `setPlayerPassword` and `bulkSetPasswords`
// in admin-actions.ts are the doors; the two functions here are the parts worth
// testing on their own.
//
// Deliberately no "show me every password" query, and no reversible column. Either
// would make a single database dump, or one accidental read of the users
// collection, a complete credential breach — and the players behind those rows hold
// real balances.

import { randomInt } from "node:crypto";

/**
 * Alphabet for generated passwords.
 *
 * Lower case plus digits, minus the characters that get misread when an operator
 * reads a password off a screen and types it back: `l` against `1`, `0` against
 * `O`. No upper case either — these get written on paper and typed on phones.
 *
 * Excludes `"`, `,` and whitespace so a value cannot break out of a CSV field even
 * before `credentialsCsv` quotes it. That is belt and braces, not the only defence.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789!#%&*?@";

/** The engine rejects anything under 6 (`ErrSmallKey`); 12 leaves room to grow. */
const PASSWORD_LENGTH = 12;

/**
 * Generates a fresh player password.
 *
 * `randomInt` rather than `Math.random`: this value is handed to a player as a
 * working credential, so the quality of the randomness is the whole security
 * property. `randomInt` is uniform over the alphabet, which a modulo of
 * `Math.random() * n` would not be — the first `256 % 38` symbols would come up
 * more often than the rest.
 */
export function generatePassword(length = PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export type CredentialRow = { email: string; username: string; password: string };

/** Quotes one CSV field if it contains anything a spreadsheet would act on. */
function csvField(value: string): string {
  // A leading =, +, - or @ is executed as a formula by Excel and Sheets. Passwords
  // here start with a letter or a symbol, but a username could be anything, so the
  // guard is on the value rather than on the generator.
  const dangerous = /^[=+\-@\t\r]/.test(value);
  if (dangerous || /[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Renders rows as CSV, header included.
 *
 * The password column is here because the whole point of the bulk tool is a sheet
 * an operator can hand over. Treat the result as a secret: it is generated on
 * request, returned to the browser once, and never persisted server-side.
 */
export function credentialsCsv(rows: CredentialRow[]): string {
  const lines = ["email,username,password"];
  for (const r of rows) {
    lines.push([r.email, r.username, r.password].map(csvField).join(","));
  }
  // Trailing newline so the file ends cleanly and `wc -l` is honest.
  return `${lines.join("\n")}\n`;
}

/**
 * Maps `items` through an async function, at most `limit` at a time, in order.
 *
 * Exists because of bcrypt: hashing one password costs ~300 ms at cost 12, so a
 * 100-player bulk reset run sequentially is half a minute of blocked request and a
 * gateway timeout in front of it. Eight at a time brings that to a few seconds
 * without opening 100 concurrent engine calls.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: width }, async () => {
      // Each worker claims the next index until the list is drained. `cursor` is only
      // ever incremented, so two workers can never claim the same slot.
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }),
  );

  return results;
}
