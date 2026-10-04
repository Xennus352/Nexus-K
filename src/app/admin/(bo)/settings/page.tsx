// Settings, grouped the way the definitions in src/lib/settings.ts declare them.
// The form mirrors SETTING_DEFS exactly, so a new setting becomes editable here
// the moment it is added to that list — nothing to wire up.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { SETTING_DEFS, loadSettings } from "@/lib/settings";
import { Button, Notice, PageTitle, Panel } from "@/components/ui";
import { Flash } from "@/components/admin/parts";
import { detectTelegramChat, saveSettingsAction, testTelegram } from "@/server/admin-actions";
import { botHandle, telegramConfigured } from "@/lib/telegram";

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
  const [values, rows, handle] = await Promise.all([
    loadSettings(),
    prisma.setting.findMany({ select: { key: true, updatedAt: true } }),
    // One extra call, and only on this page: it is the one place the operator
    // needs to see the resolved @handle to know which bot the players will hit.
    botHandle(),
  ]);
  const updatedAt = new Map(rows.map((r) => [r.key, r.updatedAt]));
  const isSuper = admin.role === "superadmin";
  const hasToken = telegramConfigured();
  const chatId = values.get("support.telegram_chat") ?? "";

  const groups = ["general", "payment", "bonus", "misc"] as const;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Settings"
        subtitle={isSuper ? "Changes apply on the next request" : "Read-only — superadmin access required to save"}
      />

      <Flash ok={sp.ok} error={sp.error} />

      {/* Telegram is wired from the environment plus one click here, so it gets a
          short instruction panel rather than living inside the generic form. */}
      <Panel title="TELEGRAM SUPPORT">
        {!hasToken ? (
          <Notice tone="info">
            Set <code className="text-amber-200">TELEGRAM_BOT_TOKEN</code> in the environment and restart to
            offer Telegram as a support channel. Everything else on this page keeps working without it.
          </Notice>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Bot{" "}
              <span className="font-mono text-sky-300">
                {handle ? `@${handle}` : "not resolved — check the token"}
              </span>{" "}
              {chatId ? (
                <>
                  is sending notifications to chat{" "}
                  <span className="font-mono text-sky-300">{chatId}</span>.
                </>
              ) : (
                <span className="text-amber-300">
                  has no notification chat yet. Open a chat with the bot, send it any message, then detect it
                  below.
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
                  <Button tone="ghost" type="submit" disabled={!chatId}>
                    Send test message
                  </Button>
                </form>
              </div>
            )}

            <p className="text-xs leading-relaxed text-slate-500">
              Players get a &ldquo;Message us on Telegram&rdquo; button on the support pages that deep-links to
              the bot with their ticket number. New tickets and player replies arrive here. The token itself is
              never shown here — it stays in the environment.
            </p>
          </div>
        )}
      </Panel>

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