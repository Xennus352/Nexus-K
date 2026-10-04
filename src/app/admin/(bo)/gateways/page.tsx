// Payment rail catalogue.
//
// Two things are deliberately visible on this screen:
//   • whether a rail has a driver at all, and whether its credentials are filled
//     in — that pair is what decides if players see it (see playerGateways())
//   • which currency and fee profile it prices with
//
// Secrets are never sent to the browser: the editor shows a placeholder and an
// empty submission keeps whatever is stored.

import { prisma } from "@/lib/prisma";
import { allGateways } from "@/lib/gateways";
import { requireAdmin } from "@/lib/admin-session";
import { allDrivers, driverFor, driverName, readArray, readConfig } from "@/lib/payments/driver";
import { fiatCurrencies } from "@/lib/money";
import { Button, Empty, PageTitle, Panel } from "@/components/ui";
import { Flash, NumField, TextField, Toggle } from "@/components/admin/parts";
import { saveGateway, toggleGateway } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  // Read the raw rows too: the editor needs the stored config and the currency
  // JSON, which `allGateways()` deliberately projects away.
  const [gateways, raw] = await Promise.all([
    allGateways(),
    prisma.gateway.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] }),
  ]);
  const rawById = new Map(raw.map((r) => [r.id, r]));
  const drivers = allDrivers();
  const isSuper = admin.role === "superadmin";

  return (
    <div className="space-y-6">
      <PageTitle
        title="Payment rails"
        subtitle={`${gateways.length} configured · ${gateways.filter((g) => g.configured).length} usable`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      {!isSuper && (
        <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          You can view this page; only a superadmin can edit rails or credentials.
        </p>
      )}

      <Panel title="AVAILABLE DRIVERS">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {drivers.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-sm font-bold text-slate-200">{d.name}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {d.fields.length === 0
                  ? "No credentials needed"
                  : `Needs ${d.fields.map((f) => f.label).join(", ")}`}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rails from the original catalogue with no driver here cannot take a payment, so they are
          listed but never offered to players even when enabled.
        </p>
      </Panel>

      {gateways.length === 0 ? (
        <Empty>No rails in the catalogue.</Empty>
      ) : (
        <div className="space-y-5">
          {gateways.map((g) => {
            const row = rawById.get(g.id);
            const spec = driverFor({ driver: g.driver });
            const config = readConfig(row?.config ?? "{}");
            const currencies = g.currencies.length > 0 ? g.currencies : [g.currency];
            const enabled = rawById.get(g.id)?.status ?? false;

            return (
              <Panel
                key={g.id}
                title={
                  <span className="flex items-center gap-2">
                    {g.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.logo} alt="" className="h-5 w-5 rounded object-contain" />
                    ) : (
                      <span className="text-sm">🏦</span>
                    )}
                    {g.name}
                    <span className="font-mono text-[10px] text-slate-500">{g.alias}</span>
                  </span>
                }
                action={
                  <div className="flex items-center gap-2">
                    {!spec && (
                      <span className="rounded-full bg-slate-500/15 px-2.5 py-0.5 text-[11px] font-bold text-slate-400">
                        no driver
                      </span>
                    )}
                    {spec && !g.configured && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                        needs credentials
                      </span>
                    )}
                    {spec && g.configured && enabled && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                        live
                      </span>
                    )}
                    {isSuper && (
                      <form action={toggleGateway}>
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="status" value={enabled ? "off" : "on"} />
                        <Button type="submit" tone="ghost" className="px-3 py-1.5 text-xs">
                          {enabled ? "Disable" : "Enable"}
                        </Button>
                      </form>
                    )}
                  </div>
                }
              >
                <form action={saveGateway} className="space-y-4">
                  <input type="hidden" name="id" value={g.id} />

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <TextField name="name" label="DISPLAY NAME" defaultValue={g.name} />
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                        DRIVER
                      </span>
                      <select
                        name="driver"
                        defaultValue={spec ? g.driver : ""}
                        className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                      >
                        {!spec && <option value={g.driver}>{g.driver} (not implemented)</option>}
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                        BASE CURRENCY
                      </span>
                      <select
                        name="currency"
                        defaultValue={g.currency}
                        className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                      >
                        {[...fiatCurrencies().map((c) => c.code), "BTC", "ETH", "USDT"].map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumField name="sort" label="DISPLAY ORDER" defaultValue={row?.sort ?? 0} step="1" />

                    <NumField name="minAmount" label="MINIMUM" defaultValue={g.minAmount} />
                    <NumField name="maxAmount" label="MAXIMUM" defaultValue={g.maxAmount} />
                    <NumField name="percentFee" label="FEE %" defaultValue={g.percentFee} />
                    <NumField name="fixedFee" label="FIXED FEE" defaultValue={g.fixedFee} />

                    <NumField
                      name="rate"
                      label="COINS PER CURRENCY UNIT"
                      defaultValue={row?.rate ?? 1}
                      hint="1000 coins are credited per 1.00 at rate 1000"
                      min={0.0001}
                    />
                  </div>

                  <TextField
                    name="currencies"
                    label="ACCEPTED CURRENCIES (COMMA SEPARATED)"
                    defaultValue={currencies.join(", ")}
                    hint="Intersected with what the app can price; anything unrecognised is ignored."
                  />

                  {(spec?.fields.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {driverName(g.driver)} credentials
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {spec!.fields.map((f) => (
                          <TextField
                            key={f.key}
                            name={`cfg_${f.key}`}
                            label={f.label.toUpperCase()}
                            // Never echo a stored secret back to the browser.
                            defaultValue={f.secret ? "" : config[f.key] ?? ""}
                            placeholder={f.secret && config[f.key] ? "•••••• stored" : ""}
                            type={f.secret ? "password" : "text"}
                            hint={f.secret && config[f.key] ? "Leave blank to keep" : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {g.driver === "manual" && (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                          PAYMENT DETAILS (ONE PER LINE, `Label: value`)
                        </span>
                        <textarea
                          name="rails"
                          rows={5}
                          defaultValue={readArray<{ label: string; value: string }>(row?.rails)
                            .map((r) => `${r.label}: ${r.value}`)
                            .join("\n")}
                          className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                          INSTRUCTIONS
                        </span>
                        <textarea
                          name="instructions"
                          rows={3}
                          defaultValue={row?.instructions ?? ""}
                          className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                        />
                      </label>
                    </>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <Toggle
                      name="status"
                      label="Offer this rail to players"
                      defaultChecked={enabled}
                      hint="Only takes effect once the credentials above are complete."
                    />
                    {isSuper && (
                      <Button type="submit" disabled={!isSuper}>
                        Save rail
                      </Button>
                    )}
                  </div>
                </form>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}