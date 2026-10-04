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
  { key: "site.maintenance", group: "general", label: "Maintenance mode", type: "bool", value: "0" },

  { key: "deposit.min", group: "payment", label: "Minimum deposit", type: "number", value: "5" },
  { key: "deposit.max", group: "payment", label: "Maximum deposit", type: "number", value: "100000" },
  { key: "withdraw.min", group: "payment", label: "Minimum withdrawal", type: "number", value: "10" },
  { key: "withdraw.max", group: "payment", label: "Maximum withdrawal", type: "number", value: "50000" },
  { key: "withdraw.rollover", group: "payment", label: "Require x1 turnover before withdrawal", type: "number", value: "1", help: "Player totalBet must reach totalDeposit × this factor." },

  { key: "bonus.welcome", group: "bonus", label: "Welcome bonus coins", type: "number", value: "500" },
  { key: "bonus.daily", group: "bonus", label: "Daily bonus coins", type: "number", value: "250" },
  { key: "bonus.deposit_percent", group: "bonus", label: "Deposit bonus %", type: "number", value: "0" },
  { key: "bonus.referral", group: "bonus", label: "Referral bonus coins (both sides)", type: "number", value: "100" },

  { key: "kyc.required_for_withdraw", group: "misc", label: "Require approved KYC to withdraw", type: "bool", value: "0" },
  { key: "tickets.enabled", group: "misc", label: "Enable support tickets", type: "bool", value: "1" },
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