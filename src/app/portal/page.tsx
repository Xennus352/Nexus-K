import { redirect } from "next/navigation";
import { Gem, ShieldCheck } from "lucide-react";
import { getAdminSession } from "@/lib/admin-session";
import { adminLogin } from "@/server/admin-actions";
import PasswordField from "@/components/PasswordField";
import LoginScene from "@/components/LoginScene";

export const dynamic = "force-dynamic";

/**
 * Staff sign-in, at /portal.
 *
 * Players get the sign-in screen at `/`; back-office staff get this one. They are
 * deliberately different screens with different credentials — the player cookie
 * `nk` and the admin cookie `nk_admin` are signed separately and a player session
 * confers no admin rights, so the only thing /portal adds is a clear place for
 * operators to type a staff password without looking like the player login.
 *
 * `/admin/login` now redirects here; see that page for why it is kept.
 */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getAdminSession()) redirect("/admin");
  const { error, next } = await searchParams;

  return (
    <LoginScene variant="staff">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-sky-400/25 bg-[#16224d]/88 shadow-[0_30px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />

        <div className="p-7 sm:p-9">
          <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
            <Gem className="h-9 w-9 text-sky-400" />
            <h1 className="text-2xl font-black tracking-tight">
              NEXUS<span className="text-sky-400">-K</span>
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-blue-300">
              Staff portal
            </p>
          </div>

          <form action={adminLogin} className="space-y-4">
            {/* Preserved so a deep link survives the sign-in round trip. */}
            {next && <input type="hidden" name="next" value={next} />}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Username or email
              </span>
              <input
                name="username"
                autoComplete="username"
                required
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-[#0e1a44] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Password
              </span>
              <PasswordField
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-[#0e1a44] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-sm text-rose-200"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(56,189,248,0.28)] transition hover:brightness-110 active:translate-y-px"
            >
              <ShieldCheck className="h-4 w-4" /> Sign in
            </button>
          </form>

          <p className="mt-6 border-t border-white/10 pt-5 text-center text-xs leading-relaxed text-slate-400/85">
            Staff access only. Player credentials are not accepted here.
          </p>
        </div>
      </div>
    </LoginScene>
  );
}