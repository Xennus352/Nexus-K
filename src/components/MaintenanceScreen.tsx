import Link from "next/link";
import LoginScene from "@/components/LoginScene";
import { maintenanceText } from "@/lib/maintenance";

/**
 * What a player sees instead of the site while `site.maintenance` is on.
 *
 * **It has to be the whole screen, not a banner.** A site that renders normally
 * with a strip across the top is a site whose deposit button still looks live, and
 * a player who starts a deposit against a database that is mid-migration is the
 * failure this mode exists to prevent. So there is no nav, no balance, no wallet —
 * nothing that invites a click leading anywhere.
 *
 * **It deliberately does not confirm how long, or what is being done.** An operator
 * who knows can write that in the note; one who does not leaves it blank and gets
 * the plain wording here. Inventing an ETA would be worse than admitting nothing.
 *
 * The back office is never shown this screen — an operator has to be able to reach
 * the switch that turns it off.
 */
export default function MaintenanceScreen({ note }: { note: string }) {
  return (
    <LoginScene>
      <div className="w-full max-w-md rounded-3xl border border-amber-300/20 bg-[#35478a]/95 p-8 text-center shadow-2xl backdrop-blur">
        {/* A slow pulse rather than a spinner: there is no progress to report, and
            a spinner would imply something is on its way. */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10 text-3xl">
          <span className="block animate-pulse">🛠️</span>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-amber-100">
          Server under maintenance
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">{maintenanceText(note)}</p>

        <dl className="mt-6 grid gap-2 rounded-2xl border border-white/5 bg-black/20 p-4 text-left text-xs">
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 shrink-0 text-slate-500">💰</dt>
            <dd className="text-slate-400">
              Any balance you had is exactly where you left it. Nothing is being spent, moved or reset.
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 shrink-0 text-slate-500">🔔</dt>
            <dd className="text-slate-400">
              We will be back shortly. Pull to refresh, or open this page again in a minute.
            </dd>
          </div>
        </dl>

        <Link
          href="/"
          className="mt-6 inline-block cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-black transition hover:brightness-110"
        >
          Try again
        </Link>
      </div>
    </LoginScene>
  );
}