import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { playerGateways } from "@/lib/gateways";
import { setting, settingNumber } from "@/lib/settings";
import { currency } from "@/lib/money";
import { ButtonLink, Notice, PageTitle, Panel } from "@/components/ui";
import DepositForm, { type GatewayChoice } from "@/components/deposit/DepositForm";

export const dynamic = "force-dynamic";

export default async function DepositPage() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");
  if (user.status !== "active") {
    return (
      <div className="space-y-6">
        <PageTitle title="Deposit" />
        <Notice>This account has been suspended, so deposits are unavailable.</Notice>
      </div>
    );
  }

  const [gateways, minSetting, maxSetting, siteCurrency] = await Promise.all([
    playerGateways(),
    settingNumber("deposit.min", 5),
    settingNumber("deposit.max", 100000),
    setting("site.currency"),
  ]);

  const choices: GatewayChoice[] = gateways.map((g) => ({
    id: g.id,
    alias: g.alias,
    name: g.name,
    driver: g.driver,
    logo: g.logo,
    currency: g.currency,
    currencies: g.currencies.length > 0 ? g.currencies : [g.currency],
    minAmount: g.minAmount,
    maxAmount: g.maxAmount,
    crypto: g.crypto,
    // Manual rails carry the account to transfer to, and the player is sent
    // straight to them with a copy button rather than having to find them.
    rails: g.rails,
    instructions: g.instructions,
  }));

  const pending = await prisma.deposit.findMany({
    where: { userId: user.id, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Deposit"
        subtitle="Add funds to your balance."
        action={
          <ButtonLink href="/deposit/history" tone="ghost">
            Deposit history
          </ButtonLink>
        }
      />

      {pending.length > 0 && (
        <Panel title="PENDING DEPOSITS">
          <ul className="space-y-2">
            {pending.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-slate-300">{d.trx}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sky-200">
                    {currency(d.currency).symbol}
                    {d.amount.toLocaleString()} {d.currency}
                  </span>
                  <ButtonLink href={`/deposit/${d.trx}`} tone="ghost" className="px-3 py-1.5 text-xs">
                    View
                  </ButtonLink>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <DepositForm
          gateways={choices}
          min={minSetting}
          max={maxSetting}
          defaultCurrency={siteCurrency || "USD"}
        />
      </Panel>

      <p className="text-xs text-slate-500">
        Every deposit carries a reference number, and an operator approves it once the transfer
        clears. A screenshot alone is enough — the reference is matched from it.
      </p>
    </div>
  );
}
