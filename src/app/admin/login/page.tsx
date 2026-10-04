import { redirect } from "next/navigation";
import { Gem, ShieldCheck } from "lucide-react";
import { getAdminSession } from "@/lib/admin-session";
import { adminLogin } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

/**
 * Staff sign-in.
 *
 * Sits outside the admin layout guard, so it checks the cookie itself and
 * bounces an already-authenticated operator to the dashboard rather than
 * showing a second login form.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getAdminSession()) redirect("/admin");
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#16224d] p-6 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <Gem className="h-9 w-9 text-sky-400" />
          <h1 className="text-2xl font-black tracking-tight">
            NEXUS<span className="text-sky-400">-K</span>
          </h1>
          <p className="text-[10px] tracking-[0.3em] text-blue-400">BACK OFFICE</p>
        </div>

        <form
          action={adminLogin}
          className="space-y-4 rounded-2xl border border-white/5 bg-[#35478a] p-6"
        >
          {/* Preserved so a deep link survives the sign-in round trip. */}
          {next && <input type="hidden" name="next" value={next} />}

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
              USERNAME OR EMAIL
            </span>
            <input
              name="username"
              autoComplete="username"
              required
              className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
              PASSWORD
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-bold shadow-[0_0_20px_rgba(56,189,248,0.35)] transition hover:brightness-110"
          >
            <ShieldCheck className="h-4 w-4" /> Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Staff access only. Player logins do not work here.
        </p>
      </div>
    </main>
  );
}