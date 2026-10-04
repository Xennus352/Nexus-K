// Key/value settings store, backed by the `Setting` collection.
//
// Reads are cached per request and per process with a short TTL so a settings
// page render never fans out into dozens of Mongo round-trips, while a save from
// the admin still becomes visible within a couple of seconds.

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type SettingDef = {
  key: string;
  group: "general" | "payment" | "bonus" | "misc";
  label: string;
  type: "text" | "textarea" | "number" | "bool" | "secret";
  value: string;
  help?: string;
};

/**
 * Defaults for every setting the app reads. A row is created on first access if
 * missing, which keeps the admin's "current values" list honest without needing
 * a separate migration step.
 */
export const SETTING_DEFS: readonly SettingDef[] = [
  { key: "site.name", group: "general", label: "Site name", type: "text", value: "Nexus-K" },
  { key: "site.support_email", group: "general", label: "Support email", type: "text", value: "support@nexus-k.test" },
  { key: "site.currency", group: "general", label: "Default currency", type: "text", value: "USD" },

  // The kill switch. Read through `src/lib/maintenance.ts`, which bypasses the
  // 30-second cache below on purpose — see the note there.
  { key: "site.maintenance", group: "general", label: "Maintenance mode", type: "bool", value: "0",
    help: "Locks every player out of the site and shows a maintenance notice. The back office stays reachable so you can turn it back off." },
  { key: "site.maintenance_note", group: "general", label: "Maintenance notice", type: "textarea", value: "",
    help: "Shown to players while maintenance is on. Left blank, they get a plain built-in message. Write no ETA you cannot keep." },

  { key: "deposit.min", group: "payment", label: "Minimum deposit", type: "number", value: "5" },
  { key: "deposit.max", group: "payment", label: "Maximum deposit", type: "number", value: "100000" },

  // KPay and Wave are phone-number rails, so the receiving number is the single
  // most consequential string in the deposit flow: players copy it verbatim and
  // transfer to it. It lives here rather than only in the rail's JSON so there is
  // exactly one place to change it, and so an operator can see it on the settings
  // screen without opening a raw textarea. Blank means "not configured yet", which
  // the deposit page renders as a visible warning rather than an empty field a
  // player could copy nothing from.
  {
    key: "deposit.receive_phone", group: "payment", label: "KPay / Wave receiving number",
    type: "text", value: "",
    help: "The number players copy on the deposit page. Leave the rail's own value in /admin/gateways to override it.",
  },
  {
    key: "deposit.receive_name", group: "payment", label: "KPay / Wave account name",
    type: "text", value: "Nexus-K",
    help: "Shown next to the number so the player recognises who they are paying.",
  },
  { key: "withdraw.min", group: "payment", label: "Minimum withdrawal", type: "number", value: "10" },
  { key: "withdraw.max", group: "payment", label: "Maximum withdrawal", type: "number", value: "50000" },
  { key: "withdraw.rollover", group: "payment", label: "Require x1 turnover before withdrawal", type: "number", value: "1", help: "Player totalBet must reach totalDeposit × this factor." },

  { key: "bonus.welcome", group: "bonus", label: "Welcome bonus coins", type: "number", value: "500" },
  { key: "bonus.daily", group: "bonus", label: "Daily bonus coins", type: "number", value: "1000" },
  { key: "bonus.deposit_percent", group: "bonus", label: "Deposit bonus %", type: "number", value: "0" },
  { key: "bonus.referral", group: "bonus", label: "Referral bonus coins (both sides)", type: "number", value: "100" },

  { key: "kyc.required_for_withdraw", group: "misc", label: "Require approved KYC to withdraw", type: "bool", value: "0" },

  // Money alerts. The bot token itself is never a setting — it is a credential
  // and lives only in TELEGRAM_BOT_TOKEN. The chat list below is filled in from
  // the bot's pending updates by "Detect from bot" on this page, so nobody has to
  // look their own chat id up by hand.
  //
  // There was a second, separate Telegram list for a support queue until the
  // support feature was removed. Alerts are the only thing the bot does now, so
  // they get the only switch: one place to turn off notifications, rather than
  // two flags that had to be reasoned about together.
  {
    key: "money.telegram_enabled", group: "payment", label: "Send deposit & withdrawal alerts to Telegram",
    type: "bool", value: "1",
    help: "When off, deposits and withdrawals still work — the operator just is not pushed a message.",
  },
  {
    key: "money.telegram_chats", group: "payment", label: "Telegram chats for deposit & withdrawal alerts",
    type: "text", value: "5458464856,6629148549",
    help: "Comma-separated chat ids. Deposit screenshots and payout details are sent here. Leave blank to use the built-in default.",
  },
] as const;

const GROUP = SETTING_DEFS.reduce<Record<string, SettingDef>>((acc, d) => {
  acc[d.key] = d;
  return acc;
}, {});

const globalCache = globalThis as unknown as { __nkSettings?: { at: number; rows: Map<string, string> } };
const TTL = 30_000;

/** Loads every setting, inserting any default that has no row yet. */
export async function loadSettings(): Promise<Map<string, string>> {
  const cached = globalCache.__nkSettings;
  if (cached && Date.now() - cached.at < TTL) return cached.rows;

  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const missing = SETTING_DEFS.filter((d) => !map.has(d.key));
  for (const d of missing) {
    // MongoDB has no "insert if absent" batch mode, so this is one upsert per
    // missing key — and it only ever runs on the very first request per process.
    await prisma.setting.upsert({
      where: { key: d.key },
      update: {},
      create: { key: d.key, value: d.value, group: d.group, label: d.label, type: d.type },
    });
    map.set(d.key, d.value);
  }
  globalCache.__nkSettings = { at: Date.now(), rows: map };
  return map;
}

export function invalidateSettings() {
  delete globalCache.__nkSettings;
}

/**
 * Reads one setting as a string. Cached per render — Next dedupes the same
 * `cache()` call within a single request tree.
 */
export const setting = cache(async (key: string): Promise<string> => {
  const map = await loadSettings();
  return map.get(key) ?? GROUP[key]?.value ?? "";
});

export async function settingNumber(key: string, fallback = 0): Promise<number> {
  const raw = await setting(key);
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function settingBool(key: string, fallback = false): Promise<boolean> {
  const raw = await setting(key);
  if (raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

/** Writes a batch of settings in one round-trip and refreshes the cache. */
export async function saveSettings(values: Record<string, string>): Promise<void> {
  const entries = Object.entries(values).filter(([key]) => GROUP[key]);
  if (entries.length === 0) return;
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: {
          key,
          value,
          group: GROUP[key].group,
          label: GROUP[key].label,
          type: GROUP[key].type,
        },
      }),
    ),
  );
  invalidateSettings();
}