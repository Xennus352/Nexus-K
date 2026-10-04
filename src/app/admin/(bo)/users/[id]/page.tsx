// Single player: profile, money history, verification and the operator tools
// (suspend, manual balance adjustment).

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { walletOf } from "@/lib/wallet";
import { setting } from "@/lib/settings";
import { fmt } from "@/lib/money";
import {
  Button,
  Empty,
  PageTitle,
  Panel,
  Stat,
  StatusBadge,
  Table,
  formatDate,
} from "@/components/ui";
import { Flash, JsonView, TextField } from "@/components/admin/parts";
import { adjustBalance, saveUserProfile, setPlayerPassword, setUserStatus } from "@/server/admin-actions";
import PlayerPasswordForm from "@/components/admin/PlayerPasswordForm";

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

export default async function AdminUserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      kyc: true,
      refBy: { select: { email: true } },
      referred: { select: { id: true, email: true, totalDeposit: true, createdAt: true } },
    },
  });
  if (!user) notFound();

  const [deposits, withdrawals, transactions, bonusClaims, currency] = await Promise.all([
    prisma.deposit.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.withdrawal.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { method: { select: { name: true } } },
    }),
    prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.bonusClaim.findMany({ where: { userId: id }, orderBy: { claimedAt: "desc" }, take: 10 }),
    setting("site.currency"),
  ]);

  // The engine is authoritative for the balance; the casino-side totals are the
  // running sums used for reports and the turnover rule.
  const wallet = user.engineUid === null ? null : await walletOf(user.engineUid).catch(() => null);
  const isSuper = admin.role === "superadmin";
  const blocked = user.status === "blocked";

  return (
    <div className="space-y-6">
      <PageTitle
        title={user.email}
        subtitle={
          <>
            {user.username && <span className="mr-2">@{user.username}</span>}
            Engine uid {user.engineUid ?? "—"} · joined {formatDate(user.createdAt)}
          </>
        }
        action={<StatusBadge status={user.status} />}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Live balance"
          value={wallet === null ? "—" : wallet.toLocaleString()}
          hint="coins, read from the engine"
          tone="good"
        />
        <Stat label="Total deposited" value={fmt(user.totalDeposit, currency)} />
        <Stat label="Total withdrawn" value={fmt(user.totalWithdraw, currency)} />
        <Stat
          label="Wagered / won"
          value={`${user.totalBet.toLocaleString()} / ${user.totalWin.toLocaleString()}`}
          hint="coins"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="ACCOUNT">
          <dl className="space-y-2 text-sm">
            <Row k="Referral code" v={<span className="font-mono text-sky-300">{user.refCode || "—"}</span>} />
            <Row k="Referred by" v={user.refBy?.email ?? "—"} />
            <Row k="Referred players" v={user.referred.length} />
            <Row k="Last login" v={formatDate(user.lastLoginAt)} />
            <Row k="Country" v={user.country || "—"} />
            <Row k="Phone" v={user.phone || "—"} />
            <Row
              k="Identity check"
              v={user.kyc ? <StatusBadge status={user.kyc.status} /> : "not submitted"}
            />
          </dl>
          {user.kyc && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Submitted document
              </div>
              <JsonView raw={user.kyc.data} />
              {user.kyc.reason && (
                <p className="mt-2 text-xs text-rose-300">Reason: {user.kyc.reason}</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="EDIT PROFILE">
          <form action={saveUserProfile} className="space-y-3">
            <input type="hidden" name="id" value={user.id} />
            <div className="grid grid-cols-2 gap-3">
              <TextField name="firstName" label="FIRST NAME" defaultValue={user.firstName} />
              <TextField name="lastName" label="LAST NAME" defaultValue={user.lastName} />
            </div>
            <TextField name="phone" label="PHONE" defaultValue={user.phone} />
            <TextField name="country" label="COUNTRY" defaultValue={user.country} />
            <Button type="submit" className="w-full">
              Save profile
            </Button>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel title={blocked ? "REINSTATE PLAYER" : "SUSPEND PLAYER"}>
            <form action={setUserStatus} className="space-y-3">
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="action" value={blocked ? "unblock" : "block"} />
              {!blocked && (
                <TextField
                  name="reason"
                  label="REASON (VISIBLE TO THE PLAYER)"
                  placeholder="Shown on their next sign-in attempt"
                />
              )}
              <Button type="submit" tone={blocked ? "good" : "danger"} className="w-full">
                {blocked ? "Reinstate account" : "Suspend account"}
              </Button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Suspending blocks sign-in and every deposit/withdrawal request. It does not touch the
              game wallet — drain it with an adjustment first if that is the intent.
            </p>
          </Panel>

          {isSuper ? (
            <>
              <Panel title="SET PASSWORD">
                <PlayerPasswordForm action={setPlayerPassword} userId={user.id} email={user.email} />
              </Panel>

              <Panel title="MANUAL BALANCE ADJUSTMENT">
              <form action={adjustBalance} className="space-y-3">
                <input type="hidden" name="id" value={user.id} />
                <TextField name="amount" label="COINS" type="number" placeholder="1000" />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                    DIRECTION
                  </span>
                  <select
                    name="direction"
                    className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                  >
                    <option value="credit">Credit (add coins)</option>
                    <option value="debit">Debit (remove coins)</option>
                  </select>
                </label>
                <TextField name="memo" label="MEMO" placeholder="Goodwill bonus, chargeback, correction…" />
                <Button type="submit" tone="gold" className="w-full">
                  Apply adjustment
                </Button>
              </form>
              <p className="mt-3 text-xs text-slate-500">
                Recorded in the ledger against your username, so the movement is never silent.
              </p>
            </Panel>
            </>
          ) : (
            <Panel title="MANUAL BALANCE ADJUSTMENT">
              <p className="text-sm text-slate-400">
                Only a superadmin can move coins by hand.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="DEPOSITS" bodyClass="p-0 sm:p-0">
        {deposits.length === 0 ? (
          <div className="p-5">
            <Empty>No deposits.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Rail", "Amount", "Coins", "Status", "When"]}>
            {deposits.map((d) => (
              <tr key={d.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 font-mono text-xs text-sky-300">{d.trx}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{d.gatewayAlias}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{fmt(d.amount, d.currency)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{d.coins.toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="WITHDRAWALS" bodyClass="p-0 sm:p-0">
        {withdrawals.length === 0 ? (
          <div className="p-5">
            <Empty>No withdrawals.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Method", "Coins", "Payout", "Status", "When"]}>
            {withdrawals.map((w) => (
              <tr key={w.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 font-mono text-xs text-sky-300">{w.trx}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{w.method.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{w.amount.toLocaleString()}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{fmt(w.net, w.currency)}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={w.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(w.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="LEDGER" bodyClass="p-0 sm:p-0">
        {transactions.length === 0 ? (
          <div className="p-5">
            <Empty>No wallet movements recorded.</Empty>
          </div>
        ) : (
          <Table head={["Reference", "Type", "Amount", "Balance after", "Memo", "When"]}>
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{t.trx}</td>
                <td className="px-4 py-2.5 text-xs text-slate-300">{TX_LABEL[t.type] ?? t.type}</td>
                <td
                  className={`px-4 py-2.5 font-mono text-xs ${
                    t.amount > 0 ? "text-emerald-300" : t.amount < 0 ? "text-rose-300" : "text-slate-400"
                  }`}
                >
                  {t.amount > 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{t.balance.toLocaleString()}</td>
                <td className="max-w-[260px] truncate px-4 py-2.5 text-xs text-slate-500">{t.memo}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="BONUS CLAIMS" bodyClass="p-0 sm:p-0">
          {bonusClaims.length === 0 ? (
            <div className="p-5">
              <Empty>No bonuses claimed.</Empty>
            </div>
          ) : (
            <Table head={["Kind", "Coins", "Claimed"]}>
              {bonusClaims.map((b) => (
                <tr key={b.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-xs capitalize text-slate-300">{b.kind}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-emerald-300">
                    +{b.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(b.claimedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{k}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-slate-200">{v}</dd>
    </div>
  );
}