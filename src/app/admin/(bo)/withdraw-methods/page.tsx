// Payout method catalogue.
//
// A method is described by the fields it asks the player for, stored as JSON.
// The editor takes that JSON verbatim (rather than a nested builder) because the
// shape is what the withdraw form reads at runtime, so what you see here is
// exactly what players get.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { readArray } from "@/lib/payments/driver";
import { Button, PageTitle, Panel } from "@/components/ui";
import { Flash, NumField, PAGE_SIZE, Pager, Tabs, TextField, Toggle, pageOf } from "@/components/admin/parts";
import { saveWithdrawMethod, toggleWithdrawMethod } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const TABS = ["all", "on", "off"] as const;
type Tab = (typeof TABS)[number];

const EXAMPLE = JSON.stringify(
  [
    { key: "accountName", label: "Account holder name", type: "text" },
    { key: "accountNumber", label: "Account / IBAN", type: "text" },
    { key: "swift", label: "SWIFT / BIC", type: "text", optional: true },
  ],
  null,
  2,
);

export default async function AdminWithdrawMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "all";
  const page = pageOf(sp);

  const all = await prisma.withdrawMethod.findMany({
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  const isSuper = admin.role === "superadmin";

  const filtered = all.filter((m) => {
    if (tab === "on") return m.status;
    if (tab === "off") return !m.status;
    return true;
  });
  const methods = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Payout methods"
        subtitle={`${all.length} method${all.length === 1 ? "" : "s"} · ${all.filter((m) => m.status).length} enabled`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      {!isSuper && (
        <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          You can view this page; only a superadmin can edit payout methods.
        </p>
      )}

      <Tabs
        base="/admin/withdraw-methods"
        active={tab}
        tabs={[
          { key: "all", label: "All methods", count: all.length },
          { key: "on", label: "Enabled", count: all.filter((m) => m.status).length },
          { key: "off", label: "Disabled", count: all.filter((m) => !m.status).length },
        ]}
      />

      <div className="space-y-5">
        {methods.map((m) => {
          const fields = readArray<{ key: string; label: string; type?: string }>(m.fields);
          return (
            <Panel
              key={m.id}
              title={
                <span className="flex items-center gap-2">
                  {m.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.logo} alt="" className="h-5 w-5 rounded object-contain" />
                  ) : (
                    <span className="text-sm">💸</span>
                  )}
                  {m.name}
                  <span className="font-mono text-[10px] text-slate-500">{m.code}</span>
                </span>
              }
              action={
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      m.status
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-slate-500/15 text-slate-300"
                    }`}
                  >
                    {m.status ? "enabled" : "disabled"}
                  </span>
                  {isSuper && (
                    <form action={toggleWithdrawMethod}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value={m.status ? "off" : "on"} />
                      <Button type="submit" tone="ghost" className="px-4 py-2 text-sm">
                        {m.status ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  )}
                </div>
              }
            >
              <form action={saveWithdrawMethod} className="space-y-4">
                <input type="hidden" name="id" value={m.id} />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField name="name" label="DISPLAY NAME" defaultValue={m.name} />
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                      PAYOUT CURRENCY
                    </span>
                    <select
                      name="currency"
                      defaultValue={m.currency}
                      className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      {["USD", "EUR", "GBP", "NGN", "INR", "BRL", "PHP", "PKR", "BDT", "THB", "USDT", "BTC", "ETH"].map(
                        (code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <NumField name="sort" label="DISPLAY ORDER" defaultValue={m.sort} step="1" />
                  <NumField
                    name="rate"
                    label="COINS PER CURRENCY UNIT"
                    defaultValue={m.rate}
                    hint="Used to turn coins into the cash actually sent"
                    min={0.0001}
                  />

                  <NumField name="minAmount" label="MINIMUM (COINS)" defaultValue={m.minAmount} />
                  <NumField name="maxAmount" label="MAXIMUM (COINS)" defaultValue={m.maxAmount} />
                  <NumField name="percentFee" label="FEE %" defaultValue={m.percentFee} />
                  <NumField name="fixedFee" label="FIXED FEE" defaultValue={m.fixedFee} />
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                    PLAYER FIELDS (JSON ARRAY)
                  </span>
                  <textarea
                    name="fields"
                    rows={Math.max(5, fields.length + 1)}
                    defaultValue={JSON.stringify(fields, null, 2)}
                    className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-sky-500"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Every entry becomes an input on the withdraw form; add
                    <code className="text-slate-400">&nbsp;&quot;optional&quot;: true&nbsp;</code>
                    to one to stop it blocking submission. Example:{" "}
                    <code className="text-slate-400">{EXAMPLE}</code>
                  </span>
                </label>

                <div className="flex items-center justify-between gap-3">
                  <Toggle name="status" label="Offer this method to players" defaultChecked={m.status} />
                  {isSuper && <Button type="submit">Save method</Button>}
                </div>
              </form>
            </Panel>
          );
        })}
      </div>

      <Pager
        page={page}
        total={filtered.length}
        base={`/admin/withdraw-methods${tab === "all" ? "" : `?tab=${tab}`}`}
        label="methods"
      />
    </div>
  );
}