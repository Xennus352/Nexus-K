import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { walletOf } from "@/lib/wallet";
import { fmt, fmtCoins } from "@/lib/money";
import { setting } from "@/lib/settings";
import { claimDailyBonus, saveProfile } from "@/server/actions";
import { submitKyc } from "@/server/kyc-actions";
import CopyButton from "@/components/CopyButton";
import {
  Button,
  Empty,
  Field,
  Notice,
  PageTitle,
  Panel,
  Stat,
  Table,
  formatDate,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  bonus: "Bonus",
  referral: "Referral",
  bet: "Bet",
  win: "Win",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");

  const user = await prisma.user.findUnique({
    where: { email: session.email },
    include: { kyc: true },
  });
  if (!user) redirect("/?error=Account+not+found");

  const wallet = user.engineUid === null ? 0 : await walletOf(user.engineUid);

  const [transactions, claimedToday, referrals, bonusClaims, currency] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.bonusClaim.findFirst({
      where: {
        userId: user.id,
        kind: "daily",
        claimKey: { endsWith: new Date().toISOString().slice(0, 10) },
      },
    }),
    prisma.user.findMany({
      where: { refById: user.id },
      select: { id: true, email: true, createdAt: true, totalDeposit: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.bonusClaim.findMany({
      where: { userId: user.id },
      orderBy: { claimedAt: "desc" },
      take: 5,
    }),
    setting("site.currency"),
  ]);

  return (
    <div className="space-y-6">
      <CopyButton />
      <PageTitle title="Wallet" subtitle="Balance, activity, bonuses and verification." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Balance" value={Math.floor(wallet).toLocaleString()} hint="coins" tone="good" />
        <Stat label="Total deposited" value={fmt(user.totalDeposit, currency)} />
        <Stat label="Total wagered" value={Math.floor(user.totalBet).toLocaleString()} hint="coins" />
        <Stat label="Total won" value={Math.floor(user.totalWin).toLocaleString()} hint="coins" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="DAILY BONUS">
          {claimedToday ? (
            <Notice tone="success">Claimed today — come back tomorrow.</Notice>
          ) : (
            <form action={claimDailyBonus}>
              <p className="text-sm text-slate-400">
                A free coin bonus, once per day. Claim it before you play.
              </p>
              <Button type="submit" tone="gold" className="mt-3">
                Claim daily bonus
              </Button>
            </form>
          )}
          {bonusClaims.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-slate-500">
              {bonusClaims.map((b) => (
                <li key={b.id}>
                  {b.kind} · {fmtCoins(b.amount)} · {formatDate(b.claimedAt)}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="REFERRAL">
          <p className="text-sm text-slate-400">
            Give this code to a friend. When our team opens their account with it, you both
            receive a referral bonus.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-white/10 bg-[#2b3a6e] px-3 py-2 font-mono text-sm text-sky-200">
              {user.refCode}
            </code>
            {/* Copies the bare code, not a link: accounts are opened by an operator
                who types the code into the new-player form, and nothing reads a
                `?ref=` query parameter any more. Copying a link here would hand the
                player something that silently does nothing. */}
            <Button
              type="button"
              tone="ghost"
              className="px-3 py-2.5 text-sm"
              data-copy={user.refCode}
            >
              Copy code
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {referrals.length} referred account{referrals.length === 1 ? "" : "s"}
          </p>
          {referrals.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {referrals.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="truncate">{r.email}</span>
                  <span className="shrink-0 font-mono">{Math.floor(r.totalDeposit).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="IDENTITY VERIFICATION">
          {user.kyc ? (
            <>
              <div className="text-sm">
                Status: <KycStatus status={user.kyc.status} />
              </div>
              {user.kyc.reason && (
                <p className="mt-2 text-xs text-rose-300">Reason: {user.kyc.reason}</p>
              )}
              {user.kyc.status === "rejected" && (
                <form action={submitKyc} className="mt-3">
                  <input type="hidden" name="resubmit" value="1" />
                  <Button type="submit" tone="ghost">
                    Resubmit details
                  </Button>
                </form>
              )}
            </>
          ) : (
            <form action={submitKyc} className="space-y-3">
              <p className="text-sm text-slate-400">
                Not required to play. Required before a payout can be requested once the operator
                turns the KYC gate on.
              </p>
              <Field label="FULL LEGAL NAME">
                <input name="fullName" required className={inputClass} />
              </Field>
              <Field label="DATE OF BIRTH (YYYY-MM-DD)">
                <input name="dob" required placeholder="1995-01-31" className={inputClass} />
              </Field>
              <Field label="COUNTRY">
                <input name="country" required className={inputClass} />
              </Field>
              <Field label="DOCUMENT NUMBER">
                <input name="document" required className={inputClass} />
              </Field>
              <Button type="submit">Submit for review</Button>
            </form>
          )}
        </Panel>
      </div>

      <Panel title="PROFILE">
        <form action={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="FIRST NAME">
            <input name="firstName" defaultValue={user.firstName} className={inputClass} />
          </Field>
          <Field label="LAST NAME">
            <input name="lastName" defaultValue={user.lastName} className={inputClass} />
          </Field>
          <Field label="PHONE">
            <input name="phone" defaultValue={user.phone} className={inputClass} />
          </Field>
          <Field label="COUNTRY">
            <input name="country" defaultValue={user.country} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Save profile</Button>
          </div>
        </form>
      </Panel>

      <Panel title="ACTIVITY" bodyClass="p-0 sm:p-0">
        {transactions.length === 0 ? (
          <div className="p-5">
            <Empty>No wallet activity yet.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Type", "Amount", "Balance after", "Date"]}>
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.trx}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-200">{TX_LABEL[t.type] ?? t.type}</span>
                  {t.memo && <div className="max-w-[280px] truncate text-[11px] text-slate-500">{t.memo}</div>}
                </td>
                <td
                  className={`px-4 py-3 font-mono ${
                    t.amount > 0 ? "text-emerald-300" : t.amount < 0 ? "text-rose-300" : "text-slate-400"
                  }`}
                >
                  {t.amount > 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {t.balance.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function KycStatus({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "text-emerald-300"
      : status === "rejected"
        ? "text-rose-300"
        : "text-amber-300";
  return <span className={`font-bold capitalize ${cls}`}>{status}</span>;
}