import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { sceneFor } from "@/lib/theme";
import { gameAccess, localGame } from "@/lib/games";
import { siteMaintenance } from "@/lib/maintenance";
import Player from "./Player";
import GameNotice from "@/components/GameNotice";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import BuffaloCabinet from "@/components/game/BuffaloCabinet";

/**
 * The game screen, deliberately outside the `(app)` chrome.
 *
 * This route lives at `/play/[alias]`, *not* inside the `(app)` group, and that
 * location is the whole point: as a member of `(app)` it inherited the shell
 * layout's sidebar, topbar, mobile nav and `p-4 pb-24 md:p-6` content padding, so
 * the "full-bleed" screen arrived inset inside a padded box with a nav rail down
 * the side — and the padding plus the cabinet is what made the page scroll. The
 * comment on this file used to claim the opposite of what shipped.
 *
 * Nothing is lost by leaving the group: the page resolves its own session and
 * redirects on its own, exactly as it did inside the layout.
 *
 * No sidebar, topbar or mobile nav: a slot machine wants the full viewport and
 * nothing competing for the edges. The background is the game's own cabinet art
 * rather than `bg-zinc-950`, which put a flat black field around an artful
 * cabinet and made the whole thing look unfinished.
 *
 * The wrapper is `flex` with `h-[100dvh] overflow-hidden` and `main` takes
 * `flex-1`. It used to be `min-h-screen` with `p-6`, which meant the cabinet was
 * inset inside a padded box and the reel window overflowed it — producing a page
 * that scrolled for no reason, on a screen whose only job is to not move.
 * `100dvh` rather than `100vh` because on mobile the URL bar makes `vh` taller
 * than the visible area, which reintroduces exactly the scroll being removed.
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

  const route = decodeURIComponent(alias);
  // A game screen has no path to a working session that this route cannot see, so
  // the kill switch has to be checked here as well — this route lives outside the
  // `(app)` shell, which is the only place a player normally sees it. A game that
  // loads while the database is being migrated is a game that records a spin
  // against a schema that is about to change.
  const maint = await siteMaintenance();
  if (maint.active) return <MaintenanceScreen note={maint.note} />;

  // `hidden` redirects rather than 404ing or redirecting to an error: the operator
  // removed it, and the lobby is always a sensible place to put a player back.
  // `maintenance` gets the explanation the lobby's two switches demand.
  const local = localGame(route);
  const gameKey = local ? local.key : route;
  const access = await gameAccess(gameKey);
  if (access.blocked && access.reason === "hidden") redirect("/lobby");
  if (access.blocked && access.reason === "maintenance") {
    return (
      <GameNotice
        title={local ? local.title : route}
        note={access.note}
      />
    );
  }

  // Local games bring their own cabinet art and their own full-screen layout; the
  // shared `h-[100dvh]` frame below is for the engine games, which render inside
  // `Player`.
  if (local) {
    return <BuffaloCabinet uid={s.uid} game={local} />;
  }

  const name = route;
  const scene = sceneFor(name, 5);

  return (
    // `w-full` as well as the height: this is a direct child of the root layout's
    // flex-column body, and `h-[100dvh]` alone leaves the width to `align-items`
    // rather than to the rule below it.
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <main
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden text-white"
        style={{
          // Two layers of the cabinet art: the real image, then a darkened copy of
          // the same gradient the app shell uses so the cabinet and the page read as
          // one scene instead of an image floating on black.
          backgroundImage: scene.cabinet,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 0%, rgba(4,6,14,0.25) 0%, rgba(4,6,14,0.72) 62%, rgba(2,3,9,0.92) 100%)",
          }}
        />
        <Player uid={s.uid} alias={name} />
      </main>
    </div>
  );
}