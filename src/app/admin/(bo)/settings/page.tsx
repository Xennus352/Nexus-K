// Settings page with tabs: General, Limits, Bonuses, Features, Telegram, P&L

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { SETTING_DEFS, loadSettings } from "@/lib/settings";
import { Button, Notice, PageTitle, Panel } from "@/components/ui";
import { Flash, Tabs } from "@/components/admin/parts";
import { detectTelegramChat, saveSettingsAction, testTelegram } from "@/server/admin-actions";
import { botHandle, moneyChats, telegramConfigured } from "@/lib/telegram";
import { getProfitReport } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const GROUP_TITLES: Record<string, string> = {
  general: "GENERAL",
  payment: "LIMITS",
  bonus: "BONUSES",
  misc: "FEATURES",
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
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const tab = (sp.tab as string) || "general";
  const validTabs = ["general", "payment", "bonus", "misc", "telegram", "profit"];
  const activeTab = validTabs.includes(tab) ? tab : "general";

  const [values, rows, handle, chats] = await Promise.all([
    loadSettings(),
    prisma.setting.findMany({ select: { key: true, updatedAt: true } }),
    botHandle(),
    moneyChats(),
  ]);
  const updatedAt = new Map(rows.map((r) => [r.key, r.updatedAt]));
  const isSuper = admin.role === "superadmin";
  const hasToken = telegramConfigured();

  // Profit report - only compute when on that tab to avoid slowing other tabs
  const [profitDaily, profitWeekly, profitMonthly] = activeTab === "profit"
    ? await Promise.all([
        getProfitReport("day"),
        getProfitReport("week"),
        getProfitReport("month"),
      ])
    : [null, null, null];

  const MONEY_CHATS_SETTING_LABEL =
    SETTING_DEFS.find((d) => d.key === "money.telegram_chats")?.label ?? "money alerts";

  const tabsConfig = [
    { key: "general", label: "General", count: SETTING_DEFS.filter((d) => d.group === "general").length },
    { key: "payment", label: "Limits", count: SETTING_DEFS.filter((d) => d.group === "payment").length },
    { key: "bonus", label: "Bonuses", count: SETTING_DEFS.filter((d) => d.group === "bonus").length },
    { key: "misc", label: "Features", count: SETTING_DEFS.filter((d) => d.group === "misc").length },
    { key: "telegram", label: "Telegram" },
    { key: "profit", label: "P&L" },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Settings"
        subtitle={isSuper ? "Changes apply on the next request" : "Read-only — superadmin access required to save"}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <Tabs
        base="/admin/settings"
        active={activeTab}
        param="tab"
        tabs={tabsConfig}
      />

      {/* General, Limits, Bonuses, Features - one form per tab */}
      {["general", "payment", "bonus", "misc"].includes(activeTab) && (
        <form action={saveSettingsAction} className="space-y-6">
          {SETTING_DEFS.filter((d) => d.group === activeTab).map((d) => {
            const value = values.get(d.key) ?? d.value;
            const common = {
              name: d.key,
              disabled: !isSuper,
              className:
                "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500 disabled:opacity-60",
            };
            return (
              <Panel key={d.key} title={d.label} className="mb-0">
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
              </Panel>
            );
          })}
          {isSuper && (
            <div className="sticky bottom-4 flex justify-end">
              <Button type="submit" className="shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                Save {activeTab} settings
              </Button>
            </div>
          )}
        </form>
      )}

      {/* Telegram tab */}
      {activeTab === "telegram" && (
        <Panel title="TELEGRAM ALERTS">
          {!hasToken ? (
            <Notice tone="info">
              Set <code className="text-amber-200">TELEGRAM_BOT_TOKEN</code> in the environment and restart to
              push deposit and withdrawal alerts. Everything else on this page keeps working without it.
            </Notice>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Bot{" "}
                <span className="font-mono text-sky-300">
                  {handle ? `@${handle}` : "not resolved — check the token"}
                </span>{" "}
                {chats.length > 0 ? (
                  <>
                    is alerting{" "}
                    <span className="font-mono text-sky-300">{chats.join(", ")}</span>
                    {chats.length === 1 ? "." : " — every new deposit and withdrawal goes to all of them."}
                  </>
                ) : (
                  <span className="text-amber-300">
                    has no alert chats. Open a chat with the bot, send it any message, then detect it below.
                  </span>
                )}
              </p>

              {isSuper && (
                <div className="flex flex-wrap gap-3">
                  <form action={detectTelegramChat}>
                    <Button tone="ghost" type="submit">
                      Detect from bot
                    </Button>
                  </form>
                  <form action={testTelegram}>
                    <Button tone="ghost" type="submit" disabled={chats.length === 0}>
                      Send test message
                    </Button>
                  </form>
                </div>
              )}

              <p className="text-xs leading-relaxed text-slate-500">
                Alerts carry payout numbers, a player&apos;s email and — for a manual deposit — the transfer
                screenshot they attached, so the chat list is worth keeping to people who should see all of that.
                Change it under{" "}
                <span className="font-semibold text-slate-400">{MONEY_CHATS_SETTING_LABEL}</span> in the Limits tab; the
                switch next to it turns alerts off without deleting the list. The bot token itself is
                never shown here — it stays in the environment.
              </p>
            </div>
          )}
        </Panel>
      )}

      {/* P&L tab */}
      {activeTab === "profit" && (
        <div className="space-y-6">
          <Panel title="DAILY P&L">
            {profitDaily ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Deposits" value={profitDaily.deposits} color="sky" />
                <StatCard label="Withdrawals" value={profitDaily.withdrawals} color="rose" />
                <StatCard label="Bonus / Adjust" value={profitDaily.bonus} color="amber" />
                <StatCard label="Net" value={profitDaily.net} color={profitDaily.net >= 0 ? "emerald" : "rose"} />
              </div>
            ) : (
              <Notice tone="info">Loading...</Notice>
            )}
          </Panel>

          <Panel title="WEEKLY P&L">
            {profitWeekly ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Deposits" value={profitWeekly.deposits} color="sky" />
                <StatCard label="Withdrawals" value={profitWeekly.withdrawals} color="rose" />
                <StatCard label="Bonus / Adjust" value={profitWeekly.bonus} color="amber" />
                <StatCard label="Net" value={profitWeekly.net} color={profitWeekly.net >= 0 ? "emerald" : "rose"} />
              </div>
            ) : (
              <Notice tone="info">Loading...</Notice>
            )}
          </Panel>

          <Panel title="MONTHLY P&L">
            {profitMonthly ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Deposits" value={profitMonthly.deposits} color="sky" />
                <StatCard label="Withdrawals" value={profitMonthly.withdrawals} color="rose" />
                <StatCard label="Bonus / Adjust" value={profitMonthly.bonus} color="amber" />
                <StatCard label="Net" value={profitMonthly.net} color={profitMonthly.net >= 0 ? "emerald" : "rose"} />
              </div>
            ) : (
              <Notice tone="info">Loading...</Notice>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}