// Gateway lookups.
//
// Two audiences, one table:
//   • the player sees only rails an admin enabled *and* that have credentials
//   • the back office sees every rail, configured or not, so it can be edited

import { prisma } from "@/lib/prisma";
import { driverFor, readArray, readConfig } from "@/lib/payments/driver";
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
  return rows.map(project).filter((g) => g.configured);
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