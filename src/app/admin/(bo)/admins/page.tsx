// Staff accounts. Superadmin only — this screen can hand out access to the
// back office, so it is gated in the page *and* in each action.

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin-session";
import { Button, PageTitle, Panel, StatusBadge, Table, formatDate } from "@/components/ui";
import { Flash, TextField } from "@/components/admin/parts";
import { resetAdminPassword, saveAdmin, setAdminStatus } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const ROLES = [
  { value: "manager", label: "Manager — view queues, reply to tickets" },
  { value: "admin", label: "Admin — everything except staff and settings" },
  { value: "superadmin", label: "Superadmin — full access, incl. money and staff" },
];

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const me = await requireSuperAdmin();
  const sp = await searchParams;

  const staff = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <PageTitle title="Staff" subtitle={`${staff.length} account${staff.length === 1 ? "" : "s"}`} />

      <Flash ok={sp.ok} error={sp.error} />

      <Panel bodyClass="p-0 sm:p-0">
        <Table head={["Account", "Role", "Status", "Last login", "Created", "Actions"]}>
          {staff.map((a) => {
            const isMe = a.id === me.id;
            const blocked = a.status === "blocked";
            return (
              <tr key={a.id} className="align-top hover:bg-white/5">
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-200">
                    {a.name || a.username}
                    {isMe && <span className="ml-2 text-[10px] text-sky-400">you</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    @{a.username} · {a.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-bold capitalize text-slate-300">
                    {a.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(a.lastLoginAt)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(a.createdAt)}</td>
                <td className="px-4 py-3">
                  {!isMe && (
                    <div className="space-y-2">
                      <form action={setAdminStatus}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="action" value={blocked ? "unblock" : "block"} />
                        <Button type="submit" tone={blocked ? "good" : "ghost"} className="w-full px-3 py-1.5 text-xs">
                          {blocked ? "Reinstate" : "Block"}
                        </Button>
                      </form>
                      <form action={resetAdminPassword} className="space-y-1.5">
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          name="password"
                          type="password"
                          placeholder="New password"
                          className="w-full rounded-lg border border-white/10 bg-[#2b3a6e] px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
                        />
                        <Button type="submit" tone="ghost" className="w-full px-3 py-1.5 text-xs">
                          Reset password
                        </Button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <Panel title="NEW STAFF ACCOUNT">
        <form action={saveAdmin} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField name="name" label="DISPLAY NAME" placeholder="Back office" />
          <TextField name="username" label="USERNAME" placeholder="jsmith" />
          <TextField name="email" label="EMAIL" type="email" placeholder="jsmith@nexus-k.test" />
          <TextField name="password" label="PASSWORD" type="password" placeholder="8+ characters" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">ROLE</span>
            <select
              name="role"
              defaultValue="admin"
              className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="EDIT YOUR OWN DETAILS">
        <form action={saveAdmin} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={me.id} />
          <input type="hidden" name="role" value={me.role} />
          <TextField name="name" label="DISPLAY NAME" defaultValue={me.name} />
          <TextField name="username" label="USERNAME" defaultValue={me.username} />
          <TextField name="email" label="EMAIL" type="email" defaultValue={me.email} />
          <TextField name="password" label="NEW PASSWORD (OPTIONAL)" type="password" />
          <div className="flex items-end">
            <Button type="submit" tone="ghost" className="w-full">
              Save my account
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Your own role and status cannot be changed from here — that is deliberate, so a compromised
          session cannot escalate itself.
        </p>
      </Panel>
    </div>
  );
}