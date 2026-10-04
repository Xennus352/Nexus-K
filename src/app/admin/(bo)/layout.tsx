import { requireAdmin } from "@/lib/admin-session";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

/**
 * Back-office gate.
 *
 * Auth lives in this layout rather than in `proxy.ts` so every admin page is
 * covered by construction: a new page inside this group inherits the redirect,
 * and there is no matcher to forget to update. It is also the natural place to
 * hang per-request bookkeeping (a hit counter, an audit log) later on.
 *
 * The `(bo)` segment is a route group — it does not appear in the URL, so this
 * guards /admin and its children while the staff sign-in at /portal sits outside
 * it entirely. Putting the gate at `src/app/admin/layout.tsx` would also capture
 * `src/app/admin/login/page.tsx` (the redirect left behind for old bookmarks) and
 * make it bounce to itself.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Resolve (and re-verify against the database) before rendering anything.
  const admin = await requireAdmin();
  return (
    <AdminShell admin={{ name: admin.name, username: admin.username, role: admin.role }}>
      {children}
    </AdminShell>
  );
}