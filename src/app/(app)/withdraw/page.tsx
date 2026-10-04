import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readArray } from "@/lib/payments/driver";
import { walletOf } from "@/lib/wallet";
import { settingNumber } from "@/lib/settings";
import { ButtonLink, Notice, PageTitle, Panel, Stat } from "@/components/ui";
import WithdrawForm, { type MethodChoice } from "@/components/withdraw/WithdrawForm";

export const dynamic = "force-dynamic";

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const [wallet, methods, rollover, kycRequired] = await Promise.all([
    user.engineUid === null ? Promise.resolve(0) : walletOf(user.engineUid),
    prisma.withdrawMethod.findMany({
      where: { status: true },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    }),
    settingNumber("withdraw.rollover", 1),
    prisma.kycSubmission.findUnique({ where: { userId: user.id } }),
  ]);

  const choices: MethodChoice[] = methods.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    logo: m.logo,
    currency: m.currency,
    minAmount: m.minAmount,
    maxAmount: m.maxAmount,
    percentFee: m.percentFee,
    fixedFee: m.fixedFee,
    rate: m.rate,
    fields: readArray<{ key: string; label: string; type: string; optional?: boolean }>(m.fields),
  }));

  const required = user.totalDeposit * rollover;
  const wageredOk = user.totalBet + 1e-9 >= required;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Withdraw"
        subtitle="Request a payout from your balance."
        action={
          <ButtonLink href="/withdraw/history" tone="ghost">
            Withdrawal history
          </ButtonLink>
        }
      />

      {error && <Notice>{error}</Notice>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available balance" value={wallet.toLocaleString()} hint="coins" tone="good" />
        <Stat
          label="Total wagered"
          value={user.totalBet.toLocaleString()}
          hint={`${user.totalWin.toLocaleString()} won`}
        />
        <Stat
          label="Total deposited"
          value={user.totalDeposit.toFixed(2)}
          hint={rollover > 0 ? `×${rollover} turnover required` : "no turnover requirement"}
        />
      </div>

      {rollover > 0 && !wageredOk && (
        <Notice tone="info">
          Withdrawals unlock once you have wagered {required.toFixed(2)} coins. You have wagered{" "}
          {user.totalBet.toFixed(2)} — {(required - user.totalBet).toFixed(2)} to go.
        </Notice>
      )}

      {kycRequired && kycRequired?.status !== "approved" && (
        <Notice tone="info">
          Identity verification must be approved before a payout can be requested.{" "}
          <ButtonLink href="/wallet#kyc" tone="ghost" className="px-3 py-1 text-xs">
            Start verification
          </ButtonLink>
        </Notice>
      )}

      <Panel>
        <WithdrawForm
          methods={choices}
          wallet={wallet}
          defaultMethodId={choices[0]?.id}
        />
      </Panel>

      <Panel title="HOW PAYOUTS WORK">
        <ul className="space-y-2 text-sm text-slate-400">
          <li>
            • The requested amount plus any fee is reserved from your balance immediately.
          </li>
          <li>• An operator verifies the request and sends the payout to your account.</li>
          <li>
            • Cancelled requests are refunded in full — the reservation is reversed automatically.
          </li>
          <li>
            • Payouts are made in the method&apos;s currency at the rate shown when you request
            them.
          </li>
        </ul>
      </Panel>
    </div>
  );
}