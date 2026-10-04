import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { manualRails } from "@/lib/payments/manual";
import { currency } from "@/lib/money";
import { ButtonLink, Empty, Notice, PageTitle, Panel, Stat, StatusBadge, formatDate } from "@/components/ui";
import DepositStatus from "@/components/deposit/DepositStatus";

export const dynamic = "force-dynamic";

export default async function DepositDetail({
  params,
}: {
  params: Promise<{ trx: string }>;
}) {
  const { trx } = await params;
  const session = await getSession();
  if (!session) redirect("/?error=Login+required");

  const user = await prisma.user.findUnique({ where: { email: session.email } });
  if (!user) redirect("/?error=Account+not+found");

  const deposit = await prisma.deposit.findUnique({
    where: { trx: decodeURIComponent(trx) },
    include: { gateway: true },
  });
  // A trx belonging to someone else is reported as missing rather than
  // forbidden, so the page cannot be used to probe for valid references.
  if (!deposit || deposit.userId !== user.id) notFound();

  const c = currency(deposit.currency);
  const rails = deposit.gateway ? manualRails(deposit.gateway) : [];
  const data = (() => {
    try {
      return JSON.parse(deposit.data) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const payAddress = typeof data.pay_address === "string" ? data.pay_address : "";
  const payAmount = typeof data.pay_amount === "string" ? data.pay_amount : "";

  return (
    <div className="space-y-6">
      <PageTitle
        title={`Deposit ${deposit.trx}`}
        subtitle={`${deposit.gatewayAlias} · ${formatDate(deposit.createdAt)}`}
        action={<ButtonLink href="/deposit" tone="ghost">New deposit</ButtonLink>}
      />

      <DepositStatus
        trx={deposit.trx}
        initialStatus={deposit.status}
        payUrl={deposit.payUrl}
      />

      {deposit.status === "cancel" && (
        <Notice>This deposit was cancelled and no funds were credited.</Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Amount" value={`${c.symbol}${deposit.amount.toLocaleString()}`} hint={deposit.currency} />
        <Stat label="Fee" value={`${c.symbol}${deposit.fee.toFixed(2)}`} />
        <Stat label="Credited" value={deposit.net.toLocaleString()} hint={deposit.currency} />
        <Stat label="Coins" value={deposit.coins.toLocaleString()} tone={deposit.status === "success" ? "good" : "default"} />
      </div>

      {deposit.status === "pending" && deposit.gateway?.driver === "manual" && (
        <Panel title="PAYMENT INSTRUCTIONS">
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="font-mono font-bold text-sky-300">1</span>
              <span>
                Send exactly{" "}
                <span className="font-mono font-bold text-sky-200">
                  {c.symbol}
                  {deposit.net.toFixed(2)}
                </span>{" "}
                using one of the accounts below.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono font-bold text-sky-300">2</span>
              <span>
                Put reference <span className="font-mono font-bold">{deposit.trx}</span> in the
                transfer note.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono font-bold text-sky-300">3</span>
              <span>An operator approves the deposit once the funds clear.</span>
            </li>
          </ol>

          {rails.length > 0 && (
            <ul className="mt-4 space-y-2">
              {rails.map((rail, i) => (
                <li
                  key={`${rail.label}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-3"
                >
                  {rail.art && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rail.art} alt="" aria-hidden className="h-9 w-9 rounded object-contain" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">
                      {rail.label}
                    </div>
                    <div className="truncate font-mono text-sm text-slate-100">{rail.value}</div>
                  </div>
                  <button
                    type="button"
                    className="ml-auto shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
                    // Copies to clipboard without a client library.
                    data-copy={rail.value}
                  >
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          )}

          {deposit.gateway?.instructions && (
            <p className="mt-4 text-sm text-slate-400">{deposit.gateway.instructions}</p>
          )}
        </Panel>
      )}

      {payAddress && deposit.status === "pending" && (
        <Panel title="CRYPTO PAYMENT">
          <p className="text-sm text-slate-400">
            Send {payAmount} to this address. The deposit is credited automatically once the
            network confirms.
          </p>
          <div className="mt-3 rounded-xl border border-white/10 bg-[#2b3a6e] p-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Address</div>
            <div className="break-all font-mono text-sm text-slate-100">{payAddress}</div>
          </div>
          <p className="mt-3 text-xs text-amber-300/80">
            Send only {deposit.gateway?.currency} on the network shown by your wallet. Funds sent on
            another chain cannot be recovered.
          </p>
        </Panel>
      )}

      <Panel title="RECEIPT">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Reference" value={deposit.trx} mono />
          <Row label="Status" value={<StatusBadge status={deposit.status} />} />
          <Row label="Method" value={deposit.gatewayAlias} />
          <Row label="Opened" value={formatDate(deposit.createdAt)} />
          {deposit.paidAt && <Row label="Credited" value={formatDate(deposit.paidAt)} />}
          {deposit.reference && <Row label="Provider reference" value={deposit.reference} mono />}
          {deposit.adminNote && <Row label="Note" value={deposit.adminNote} />}
        </dl>
      </Panel>

      {deposit.status === "pending" && (
        <Notice tone="info">
          Payments that are not completed within a reasonable window are cancelled automatically.{" "}
          <ButtonLink href="/support/new" tone="ghost" className="px-3 py-1 text-xs">
            Report a problem
          </ButtonLink>
        </Notice>
      )}

      <Panel title="RECENT">
        {deposit.status === "success" ? (
          <Empty>No further action needed — this deposit is credited.</Empty>
        ) : (
          <Empty>Once credited, your balance updates immediately.</Empty>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className={mono ? "font-mono text-sm text-slate-100" : "text-sm text-slate-100"}>
        {value}
      </dd>
    </div>
  );
}