// Gateway lookups.
//
// Two audiences, one table:
//   • the player sees only rails an admin enabled *and* that have credentials
//   • the back office sees every rail, configured or not, so it can be edited

import { prisma } from "@/lib/prisma";
import { driverFor, readArray, readConfig } from "@/lib/payments/driver";
import { manualRails } from "@/lib/payments/manual";
import { setting } from "@/lib/settings";
import { fiatCurrencies, isCrypto } from "@/lib/money";

export type GatewayOption = {
  id: string;
  alias: string;
  name: string;
  driver: string;
  logo: string;
  currency: string;
  minAmount: number;
  maxAmount: number;
  /** Coins credited per 1 currency unit of net deposit. */
  rate: number;
  /** Percentage taken from a deposit before coins are computed. */
  percentFee: number;
  /** Flat fee taken from a deposit, in the gateway's currency. */
  fixedFee: number;
  /** Currencies the rail accepts, parsed from the JSON column. */
  currencies: string[];
  crypto: boolean;
  /**
   * Manual rails only: the accounts to transfer to, and any free-text note.
   *
   * Projected rather than re-read in the page so the deposit form and the
   * deposit detail page render the same account list from the same call — they
   * disagreed before, because one went through `manualRails()` and the other read
   * nothing at all.
   */
  rails: { label: string; value: string; art?: string }[];
  instructions: string;
};

type GatewayRow = {
  id: string;
  alias: string;
  name: string;
  driver: string;
  logo: string;
  currency: string;
  minAmount: number;
  maxAmount: number;
  rate: number;
  percentFee: number;
  fixedFee: number;
  currencies: string;
  config: string;
  status: boolean;
  sort: number;
  instructions: string;
  rails: string;
};

function project(row: GatewayRow): GatewayOption & { configured: boolean } {
  const driver = driverFor(row);
  return {
    id: row.id,
    alias: row.alias,
    name: row.name,
    driver: row.driver,
    logo: row.logo,
    currency: row.currency,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
    rate: row.rate,
    percentFee: row.percentFee,
    fixedFee: row.fixedFee,
    currencies: readArray<string>(row.currencies),
    crypto: isCrypto(row.currency),
    // Parsed here rather than in each caller. `manualRails` handles the legacy
    // `Label: value` instructions format, so an old row that predates the rails
    // column still shows something.
    rails: row.driver === "manual" ? manualRails(row) : [],
    instructions: row.driver === "manual" ? row.instructions : "",
    // A rail with no driver at all (a legacy PHP alias we do not implement) can
    // never take a payment, so it counts as unconfigured regardless of status.
    configured: driver ? driver.configured(readConfig(row.config)) : false,
  };
}

/** Rails offered on the deposit page: enabled, implemented and credentialed. */
export async function playerGateways(): Promise<GatewayOption[]> {
  const rows = await prisma.gateway.findMany({
    where: { status: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  const projected = rows
    .map(project)
    .filter((g) => g.configured && (PLAYER_RAILS as readonly string[]).includes(g.alias));
  // One settings read for every rail, not one per rail.
  const [phone, holder] = await receivingDetails();
  return projected.map((g) => ({ ...g, rails: fillPhoneRails(g.rails, phone, holder) }));
}

/**
 * The only rails the deposit page offers.
 *
 * This casino takes its deposits over mobile money transfer and nothing else.
 * Offering a Stripe or PayPal tile that is not actually going to be paid into
 * costs more than it earns: the player completes a checkout the operator then has
 * to reconcile by hand, or — worse — the rail is switched off by an operator
 * without noticing and the tile takes them to a dead checkout.
 *
 * The rest of the catalogue is untouched and still fully editable at
 * `/admin/gateways`, so turning KPay back into a Stripe Checkout is a rename and
 * a driver change, not a code change.
 */
export const PLAYER_RAILS = ["KPay", "Wave"] as const;

/**
 * The KPay/Wave receiving number and account name.
 *
 * Read here rather than baked into the rail's JSON at seed time because the
 * number is the one value in the deposit flow that has to be right: players copy
 * it verbatim. Having it in settings means one edit in one screen changes every
 * place it appears, instead of a hand-edited JSON blob that can drift.
 */
async function receivingDetails(): Promise<[string, string]> {
  const [phone, holder] = await Promise.all([
    setting("deposit.receive_phone"),
    setting("deposit.receive_name"),
  ]);
  return [phone.trim(), holder.trim()];
}

/**
 * Fills blank rail values from the receiving settings.
 *
 * Only blanks are filled. A rail that has its own value is left exactly as the
 * operator typed it, so a rail can always override the global setting — that is
 * what makes this a fallback rather than a rewrite, and what lets the generic
 * "Bank Account" rail keep its own account details.
 */
export function fillPhoneRails(
  rails: { label: string; value: string; art?: string }[],
  phone: string,
  holder: string,
): { label: string; value: string; art?: string }[] {
  if (rails.every((r) => r.value.trim() !== "")) return rails;
  return rails.map((r) =>
    r.value.trim() !== ""
      ? r
      : { ...r, value: phone ? (holder ? `${phone} · ${holder}` : phone) : "" },
  );
}

/**
 * Manual rails with blank values resolved against the receiving settings.
 *
 * Exported so the deposit detail page — which holds the raw gateway row, not a
 * `GatewayOption` — renders the same account list the form did. It used to call
 * `manualRails()` directly, so a deposit opened from a stale tab could show an
 * empty number the form had shown correctly.
 */
export async function railsForDeposit(gateway: {
  driver: string;
  rails: string;
  instructions: string;
}): Promise<{ label: string; value: string; art?: string }[]> {
  if (gateway.driver !== "manual") return [];
  const [phone, holder] = await receivingDetails();
  return fillPhoneRails(manualRails(gateway), phone, holder);
}

/** Every rail, for the admin gateway screen. */
export async function allGateways() {
  const rows = await prisma.gateway.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  return rows.map(project);
}

export async function gatewayById(id: string) {
  const row = await prisma.gateway.findUnique({ where: { id } });
  return row ? project(row) : null;
}

export async function gatewayByAlias(alias: string) {
  const row = await prisma.gateway.findUnique({ where: { alias } });
  return row ? project(row) : null;
}

/** Currency picker for a rail, intersected with what the app can price. */
export function gatewayCurrencies(gateway: Pick<GatewayOption, "currencies" | "currency">): string[] {
  const offered = gateway.currencies.length > 0 ? gateway.currencies : [gateway.currency];
  const known = new Set([...fiatCurrencies().map((c) => c.code), "BTC", "ETH", "USDT", "LTC", "DOGE"]);
  const usable = offered.map((c) => c.toUpperCase()).filter((c) => known.has(c));
  return usable.length > 0 ? usable : [gateway.currency.toUpperCase()];
}