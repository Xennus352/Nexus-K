// Bulk credential sheet.
//
// The one screen that ends up holding every player's password, which is why it is
// superadmin-only and why the sheet itself never touches the database.
//
// Nothing here can *read* a password. `bulkSetPasswords` replaces them with fresh
// values and renders a CSV of what it set, held in memory for ten minutes
// (`src/server/credential-reports.ts`). The honest framing, which the page says out
// loud, is that this replaces passwords rather than revealing them: bcrypt hashes
// and engine secrets cannot be reversed.

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";
import { PageTitle, Panel } from "@/components/ui";
import { Flash } from "@/components/admin/parts";
import { bulkSetPasswords } from "@/server/admin-actions";
import { getCredentialReport } from "@/server/credential-reports";
import BulkCredentialsForm from "@/components/admin/BulkCredentialsForm";

export const dynamic = "force-dynamic";

/** Enough rows to choose from comfortably; the run itself is capped in the action. */
const LIST_LIMIT = 100;

export default async function AdminUserCredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; report?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  if (admin.role !== "superadmin") {
    return (
      <div className="space-y-6">
        <PageTitle title="Credentials" />
        <Panel>
          <p className="text-sm text-slate-400">
            Only a superadmin can set player passwords.
          </p>
        </Panel>
      </div>
    );
  }

  const q = (sp.q ?? "").trim().slice(0, 80);
  const status = ["active", "blocked"].includes(sp.status ?? "") ? sp.status! : "";

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { refCode: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [players, total, report] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: { id: true, email: true, username: true },
    }),
    prisma.user.count({ where }),
    // A blank token reads as "no report", not as an error — the page is also its
    // own pre-run state.
    Promise.resolve(sp.report ? getCredentialReport(sp.report) : null),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Credentials"
        subtitle={`Set passwords in bulk · ${total.toLocaleString()} account${total === 1 ? "" : "s"} in scope`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      {sp.report && !report && (
        <Panel>
          <p className="text-sm text-amber-200">
            That credential sheet has expired or the server restarted. Run the tool again — sheets
            are held in memory for ten minutes and never written to the database.
          </p>
        </Panel>
      )}

      <Panel>
        <BulkCredentialsForm
          action={bulkSetPasswords}
          players={players}
          total={total}
          csv={report?.csv}
          count={report?.count}
          failures={report?.failures}
          q={q}
          status={status}
        />
      </Panel>
    </div>
  );
}
