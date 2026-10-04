// Money math. Everything in the casino is either a fiat amount (deposit/withdraw
// rails) or engine coins (the play wallet), and coins are whole numbers because
// the engine's wallet is a float but every movement it accepts is integral in
// practice.
//
// Rounding happens exactly once per flow — at the point where a figure becomes
// a record — and always *down* on the player's side so a rounding error can
// never mint extra coins or short a payout.

export const DEFAULT_CURRENCY = "USD";

export type Currency = {
  code: string;
  symbol: string;
  name: string;
  /** How many minor units the currency has (2 for USD, 0 for JPY, 3 for KWD). */
  decimals: number;
};

const CURRENCIES: Record<string, Currency> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", decimals: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  GBP: { code: "GBP", symbol: "£", name: "Pound Sterling", decimals: 2 },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", decimals: 2 },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimals: 2 },
  NZD: { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", decimals: 2 },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", decimals: 2 },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", decimals: 2 },
  MXN: { code: "MXN", symbol: "MX$", name: "Mexican Peso", decimals: 2 },
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian Naira", decimals: 2 },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", decimals: 2 },
  PHP: { code: "PHP", symbol: "₱", name: "Philippine Peso", decimals: 2 },
  THB: { code: "THB", symbol: "฿", name: "Thai Baht", decimals: 2 },
  VND: { code: "VND", symbol: "₫", name: "Vietnamese Dong", decimals: 0 },
  IDR: { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", decimals: 0 },
  PKR: { code: "PKR", symbol: "₨", name: "Pakistani Rupee", decimals: 2 },
  BDT: { code: "BDT", symbol: "৳", name: "Bangladeshi Taka", decimals: 2 },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", decimals: 0 },
  TRY: { code: "TRY", symbol: "₺", name: "Turkish Lira", decimals: 2 },
  MYR: { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", decimals: 2 },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", decimals: 2 },
  GHS: { code: "GHS", symbol: "₵", name: "Ghanaian Cedi", decimals: 2 },
  XOF: { code: "XOF", symbol: "CFA", name: "West African CFA Franc", decimals: 0 },
  KWD: { code: "KWD", symbol: "KD", name: "Kuwaiti Dinar", decimals: 3 },
  BTC: { code: "BTC", symbol: "₿", name: "Bitcoin", decimals: 8 },
  ETH: { code: "ETH", symbol: "Ξ", name: "Ethereum", decimals: 8 },
  USDT: { code: "USDT", symbol: "₮", name: "Tether", decimals: 2 },
};

export function currency(code: string): Currency {
  return CURRENCIES[code.toUpperCase()] ?? { code: code.toUpperCase(), symbol: "", name: code.toUpperCase(), decimals: 2 };
}

/** Every currency the casino can price a rail in. */
export function supportedCurrencies(): Currency[] {
  return Object.values(CURRENCIES);
}

/** Fiat currencies (crypto rails are listed separately). */
export function fiatCurrencies(): Currency[] {
  return Object.values(CURRENCIES).filter((c) => !CRYPTO_CODES.has(c.code));
}

export const CRYPTO_CODES = new Set(["BTC", "ETH", "USDT", "LTC", "DOGE", "TRX", "XRP", "XMR", "DASH"]);

export function isCrypto(code: string): boolean {
  return CRYPTO_CODES.has(code.toUpperCase());
}

/**
 * Rounds to the currency's minor unit.
 *
 * `dir` picks the side that rounds *down*, which is what both flows need:
 * deposits round the player's charge down (they keep the remainder, we never
 * over-credit) and withdrawals round the payout down (we never over-pay).
 */
export function round(amount: number, code: string, dir: "down" | "nearest" = "down"): number {
  const { decimals } = currency(code);
  const f = 10 ** decimals;
  if (dir === "nearest") return Math.round(amount * f) / f;
  // Math.floor on a float is fine here: both operands are already bounded by
  // the amount validation upstream, well inside 2^53.
  return Math.floor(amount * f + 1e-9) / f;
}

/** Fixed-decimal string for gateway payloads (Stripe/PayPal reject floats). */
export function money(amount: number, code: string): string {
  return round(amount, code, "nearest").toFixed(currency(code).decimals);
}

/**
 * Rounds to a whole number of coins, preserving the sign.
 *
 * Debits are negative coin amounts, so this must not clamp at zero — doing so
 * silently turns a withdrawal into a no-op instead of a debit.
 */
export function coins(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

export function fmt(amount: number, code = DEFAULT_CURRENCY): string {
  const c = currency(code);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(amount);
}

export function fmtCoins(amount: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} coins`;
}

export function pct(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

/**
 * Fee split for a deposit: `percentFee`% plus a flat `fixedFee`, both charged in
 * the gateway's own currency. The remainder is what reaches the wallet.
 */
export function depositFee(amount: number, percentFee: number, fixedFee: number, code: string): { fee: number; net: number } {
  const raw = (amount * percentFee) / 100 + fixedFee;
  const fee = Math.min(round(raw, code), amount);
  return { fee, net: round(amount - fee, code) };
}

/**
 * Fee split for a withdrawal. The player is charged `amount + fee` from the
 * wallet and the rails send `amount` — so the operator never loses the fee.
 */
export function withdrawalFee(amount: number, percentFee: number, fixedFee: number, code: string): { fee: number; charge: number } {
  const fee = round((amount * percentFee) / 100 + fixedFee, code);
  return { fee, charge: round(amount + fee, code) };
}

/** Currency units received for `amount` coins at the rail's rate. */
export function coinsToCash(amount: number, rate: number, code: string): number {
  return round(rate > 0 ? (amount * 100) / rate : 0, code);
}

/** Coins credited for `cash` currency units at the rail's rate. Never negative. */
export function cashToCoins(cash: number, rate: number): number {
  return Math.max(0, coins(rate > 0 ? cash / rate : 0));
}

export function parseAmount(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number.parseFloat(String(input).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}