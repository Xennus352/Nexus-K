import Link from "next/link";

/**
 * Shown when one game is suspended while the rest of the site is running.
 *
 * **Separate from the site-wide maintenance screen on purpose.** The operator has
 * two different switches and they mean different things: `site.maintenance` means
 * "everything is down, come back later", and a per-game flag means "this one game
 * is being worked on, the rest of the casino is open". A player sent here gets a
 * link back into the lobby and a balance that still works — telling them the whole
 * server is down when it is not would be a lie that loses them the rest of the site.
 *
 * A game that is hidden rather than suspended does not come here at all; it
 * redirects to the lobby, because the operator removed it and there is nothing
 * useful to say about something that is gone.
 */
export default function GameNotice({
  title,
  note,
  backTo = "/lobby",
}: {
  title: string;
  note: string;
  backTo?: string;
}) {
  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-[#0b1020] px-6 text-center text-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10 text-3xl">
        <span className="block animate-pulse">🛠️</span>
      </div>

      <div className="max-w-md">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300/80">Under maintenance</p>
        <h1 className="mt-2 text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {note.length > 0
            ? note
            : "This game is being worked on right now. Everything else in the casino is open — your balance is exactly where you left it."}
        </p>
      </div>

      <Link
        href={backTo}
        className="cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-black transition hover:brightness-110"
      >
        Back to the lobby
      </Link>
    </div>
  );
}