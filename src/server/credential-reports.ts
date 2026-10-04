// Short-lived home for generated credential sheets.
//
// In memory on purpose. A sheet of working passwords is the most sensitive thing
// this app ever renders, so it should not outlive the request that produced it: no
// database row, no file on disk, nothing to sweep up later. The cost is that a
// sheet does not survive a restart and does not work behind more than one server
// instance — both are reported to the operator rather than quietly rendering an
// empty page.
//
// The bulk tool redirects here with a `report` token after it has changed the
// passwords; the credentials page swaps that token back for the sheet. Nothing in
// this module is reachable without a superadmin session, because the only reader
// is the page, which checks the role before calling `getCredentialReport`.

import { randomBytes } from "node:crypto";
import { credentialsCsv, type CredentialRow } from "./credentials";

/** Long enough to copy a sheet and download it, short enough not to be a store. */
const TTL_MS = 10 * 60 * 1000;

/** Bounds memory if the tool is run repeatedly. Oldest sheets are evicted first. */
const MAX_REPORTS = 20;

export type CredentialReport = {
  csv: string;
  count: number;
  /** One line per player that could not be changed, and why. */
  failures: string[];
  at: number;
};

// On globalThis so a dev hot-reload does not silently orphan the sheets in flight.
const globalStore = globalThis as unknown as {
  __nkCredentialReports?: Map<string, CredentialReport>;
};

function store(): Map<string, CredentialReport> {
  if (!globalStore.__nkCredentialReports) globalStore.__nkCredentialReports = new Map();
  return globalStore.__nkCredentialReports;
}

/** Renders the rows, files the sheet, and returns the token that reads it back. */
export function putCredentialReport(rows: CredentialRow[], failures: string[]): string {
  const m = store();
  const now = Date.now();

  for (const [token, report] of m) {
    if (now - report.at > TTL_MS) m.delete(token);
  }
  // Map preserves insertion order, so the first key is the oldest sheet.
  while (m.size >= MAX_REPORTS) {
    const oldest = m.keys().next();
    if (oldest.done) break;
    m.delete(oldest.value);
  }

  const token = randomBytes(16).toString("hex");
  m.set(token, { csv: credentialsCsv(rows), count: rows.length, failures, at: now });
  return token;
}

/**
 * Reads a sheet back. Returns null once it has expired, and deletes it on the way
 * out so a stale link in browser history cannot be replayed.
 */
export function getCredentialReport(token: string): CredentialReport | null {
  const m = store();
  const report = m.get(token);
  if (!report) return null;
  if (Date.now() - report.at > TTL_MS) {
    m.delete(token);
    return null;
  }
  return report;
}
