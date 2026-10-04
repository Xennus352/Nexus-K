import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { walletOf } from "@/lib/wallet";
import { noticesFor } from "@/server/notices";
import {
  ButtonLink,
  Notice,
  PageTitle,
  Panel,
  Stat,
  StatusBadge,
  Table,
  formatDate,
} from "@/components/ui";
import NotificationList from "@/components/NotificationList";

/**
 * The player's own account.
 *
 * Everything here was already stored and already shown somewhere — the balance in
 * the topbar, the referral code on the dashboard, the transactions in the wallet.
 * This page gathers it into one place with nothing hidden behind a hover, because
 * "which account am I in, and where do I send my payout" is the first question
 * anyone asks and there was no single screen that answered it.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");

  const user = await prisma.user.findUnique({
    where: { email: s.email },
    include: { kyc: true },
  });
  if (!user) redirect("/?error=Account+not+found");

  const balance = user.engineUid === null ? null : await walletOf(user.engineUid).catch(() => null);

  const [transactions, depositCount, withdrawalCount, notices] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.deposit.count({ where: { userId: user.id, status: "success" } }),
    prisma.withdrawal.count({ where: { userId: user.id, status: "success" } }),
    // Read here rather than fetched by the client: the screen a player opens to
    // find out what is happening to their money must never render an empty state
    // while it is still finding out.
    noticesFor(user.id),
  ]);

  const blocked = user.status !== "active";
  const walletBalance = balance ?? 0;

  return (
    <div className="space-y-6">
      <PageTitle
        title="My account"
        subtitle="Your identity, referral code, balance and recent activity."
      />

      {blocked && (
        <Notice>
          This account is suspended
          {user.banReason ? `: ${user.banReason}` : "."} Deposits and withdrawals are unavailable
          until it is restored.
        </Notice>
      )}

      <NotificationList initial={notices} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Balance" value={`${walletBalance.toLocaleString()} coins`} tone="good" />
        <Stat label="Deposited" value={`${depositCount} approved`} />
        <Stat label="Withdrawn" value={`${withdrawalCount} paid`} />
        <Stat
          label="Verification"
          value={user.kyc ? user.kyc.status : "not submitted"}
          tone={user.kyc?.status === "approved" ? "good" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="IDENTITY">
          <dl className="space-y-2 text-sm">
            <Row label="Email" value={<span className="font-mono">{user.email}</span>} />
            <Row label="Username" value={user.username || <Dash />} />
            <Row
              label="Full name"
              value={
                [user.firstName, user.lastName].filter(Boolean).join(" ") || <Dash />
              }
            />
            <Row label="Phone" value={user.phone ? <span className="font-mono">{user.phone}</span> : <Dash />} />
            <Row label="Country" value={user.country || <Dash />} />
            <Row
              label="Status"
              value={<StatusBadge status={blocked ? "blocked" : "active"} />}
            />
            <Row label="Member since" value={formatDate(user.createdAt)} />
            <Row label="Last sign-in" value={formatDate(user.lastLoginAt)} />
          </dl>
        </Panel>

        <Panel title="REFERRAL">
          <p className="mb-3 text-xs text-slate-400">
            Share this code. When someone registers with it, both sides are credited.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-950/40 px-4 py-3">
            <code
              data-testid="account-refcode"
              className="min-w-0 flex-1 truncate font-mono text-lg font-bold text-sky-300"
            >
              {user.refCode || "—"}
            </code>
            {user.refCode && (
              // Delegated handler mounted by the (app) layout.
              <button
                type="button"
                data-copy={user.refCode}
                className="cursor-pointer rounded-lg border border-sky-400/30 px-3 py-1.5 text-xs font-bold text-sky-200 transition hover:bg-sky-500/20"
              >
                Copy
              </button>
            )}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Total wagered" value={`${Math.round(user.totalBet).toLocaleString()} coins`} />
            <Row label="Total won" value={`${Math.round(user.totalWin).toLocaleString()} coins`} />
            <Row
              label="Turnover"
              value={
                // The withdrawal rule is a turnover multiple, so showing it as
                // "met / not met" saves the player guessing at a refund.
                user.totalDeposit > 0
                  ? `${(user.totalBet / user.totalDeposit).toFixed(2)}× deposits`
                  : "no deposits yet"
              }
            />
          </dl>
        </Panel>
      </div>

      <Panel
        title="RECENT TRANSACTIONS"
        bodyClass="p-0 sm:p-0"
        action={
          <ButtonLink href="/wallet" tone="ghost" className="px-3 py-1.5 text-xs">
            Full ledger
          </ButtonLink>
        }
      >
        {transactions.length === 0 ? (
          <div className="p-5 text-sm text-slate-400">No transactions yet.</div>
        ) : (
          <Table head={["Reference", "Type", "Amount", "Balance after", "When"]}>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2.5 font-mono text-xs text-sky-300">{t.trx}</td>
                <td className="px-4 py-2.5 text-xs text-slate-300">{t.memo || t.type}</td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${
                    t.amount >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                  {Math.round(t.balance).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
      <dt className="shrink-0 text-xs font-semibold tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-100">{value}</dd>
    </div>
  );
}

function Dash() {
  return <span className="text-slate-600">—</span>;
}