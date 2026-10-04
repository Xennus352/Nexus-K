import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { sceneFor } from "@/lib/theme";
import Player from "./Player";

/**
 * The game screen, deliberately outside the `(app)` chrome.
 *
 * No sidebar, topbar or mobile nav: a slot machine wants the full viewport and
 * nothing competing for the edges. The background is the game's own cabinet art
 * rather than `bg-zinc-950`, which put a flat black field around an artful
 * cabinet and made the whole thing look unfinished.
 *
 * `sceneFor` needs a reel count it only learns after the first deal, so the page
 * guesses 5 — the engine's default. The Player component re-renders the cabinet
 * with the real count the moment it arrives; only this page-level wash is
 * approximate, and it is behind everything else.
 */
export default async function PlayPage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const { alias } = await params;
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");

  const name = decodeURIComponent(alias);
  const scene = sceneFor(name, 5);

  return (
    <main
      className="flex min-h-screen flex-col items-center p-6 text-white"
      style={{
        // Two layers of the cabinet art: the real image, then a darkened copy of
        // the same gradient the app shell uses so the cabinet and the page read as
        // one scene instead of an image floating on black.
        backgroundImage: scene.cabinet,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(4,6,14,0.25) 0%, rgba(4,6,14,0.72) 62%, rgba(2,3,9,0.92) 100%)",
        }}
      />
      <Player uid={s.uid} alias={name} />
    </main>
  );
}
