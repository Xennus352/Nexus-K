import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { gameAccess } from "@/lib/games";
import { siteMaintenance } from "@/lib/maintenance";
import GameNotice from "@/components/GameNotice";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import RotatePrompt from "@/components/RotatePrompt";
import Player from "./Player";

export const dynamic = "force-dynamic";

/**
 * The game screen, deliberately outside the `(app)` chrome.
 *
 * This route lives at `/play/[alias]`, *not* inside the `(app)` group.
 * All games are proxied from the Go slotopol engine.
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
  const maint = await siteMaintenance();
  if (maint.active) return <MaintenanceScreen note={maint.note} />;

  const gameKey = route;
  const access = await gameAccess(gameKey);
  if (access.blocked && access.reason === "hidden") redirect("/lobby");
  if (access.blocked && access.reason === "maintenance") {
    return (
      <GameNotice
        title={gameKey}
        note={access.note}
      />
    );
  }

  return (
    // `100dvh` rather than `100vh`: on mobile `vh` measures the viewport with
    // the browser chrome *hidden*, so a `100vh` cabinet is taller than the space
    // actually visible and the console ends up under the toolbar. `dvh` tracks
    // the real height as that chrome collapses.
    <div className="h-[100dvh] w-full overflow-hidden bg-black">
      <Player uid={s.uid} alias={gameKey} />
      <RotatePrompt />
    </div>
  );
}