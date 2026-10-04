import { redirect } from "next/navigation";

// The staff sign-in moved to /portal. This path is kept as a redirect rather than
// deleted because it was the documented back-office entry point and operators have
// it bookmarked — including in the README's setup steps and in any runbook.
//
// It has to stay *outside* the (bo) route group: /portal is the unguarded page,
// and /admin/login is a redirect that must not sit behind the admin gate, or a
// signed-out operator would bounce /admin/login → /admin → /admin/login forever.
export default function AdminLoginRedirect() {
  redirect("/portal");
}