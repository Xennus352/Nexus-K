// Settings, grouped the way the definitions in src/lib/settings.ts declare them.
// The form mirrors SETTING_DEFS exactly, so a new setting becomes editable here
// the moment it is added to that list — nothing to wire up.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { SETTING_DEFS, loadSettings } from "@/lib/settings";
import { Button, PageTitle, Panel } from "@/components/ui";
import { Flash } from "@/components/admin/parts";
import { saveSettingsAction } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const GROUP_TITLES: Record<string, string> = {
  general: "GENERAL",
  payment: "LIMITS & PAYOUT RULES",
  bonus: "BONUSES",
  misc: "FEATURE SWITCHES",
};

const GROUP_HELP: Record<string, string> = {
  general: "Naming, default currency and the maintenance flag.",
  payment: "Applied on top of each rail's own limits — the stricter of the two wins.",
  bonus: "Coin amounts, applied to the engine wallet the moment the claim succeeds.",
  misc: "Gates that change what a player is allowed to do.",
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  // Read through loadSettings so a key with no row yet still renders (and gets
  // created) rather than showing an empty box for an unset value.
  const [values, rows] = await Promise.all([
    loadSettings(),
    prisma.setting.findMany({ select: { key: true, updatedAt: true } }),
  ]);
  const updatedAt = new Map(rows.map((r) => [r.key, r.updatedAt]));
  const isSuper = admin.role === "superadmin";

  const groups = ["general", "payment", "bonus", "misc"] as const;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Settings"
        subtitle={isSuper ? "Changes apply on the next request" : "Read-only — superadmin access required to save"}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <form action={saveSettingsAction} className="space-y-6">
        {groups.map((group) => {
          const defs = SETTING_DEFS.filter((d) => d.group === group);
          if (defs.length === 0) return null;
          return (
            <Panel key={group} title={GROUP_TITLES[group]}>
              <p className="mb-4 text-xs text-slate-500">{GROUP_HELP[group]}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {defs.map((d) => {
                  const value = values.get(d.key) ?? d.value;
                  const common = {
                    name: d.key,
                    disabled: !isSuper,
                    className:
                      "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500 disabled:opacity-60",
                  };
                  return (
                    <label key={d.key} className="block">
                      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                        {d.label}
                      </span>
                      {d.type === "bool" ? (
                        <span className="flex h-[42px] items-center gap-2">
                          <input
                            {...common}
                            type="checkbox"
                            value="1"
                            defaultChecked={value === "1"}
                            className="h-4 w-4 accent-sky-500"
                          />
                          <span className="text-sm text-slate-400">enabled</span>
                        </span>
                      ) : d.type === "textarea" ? (
                        <textarea {...common} rows={4} defaultValue={value} />
                      ) : (
                        <input {...common} type={d.type === "number" ? "number" : "text"} defaultValue={value} step="any" />
                      )}
                      <span className="mt-1 block text-[11px] text-slate-500">
                        <code className="text-slate-400">{d.key}</code>
                        {d.help && <> · {d.help}</>}
                        {updatedAt.has(d.key) && <> · saved {updatedAt.get(d.key)!.toISOString().slice(0, 16).replace("T", " ")}</>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Panel>
          );
        })}

        {isSuper && (
          <div className="sticky bottom-4 flex justify-end">
            <Button type="submit" className="shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              Save settings
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}