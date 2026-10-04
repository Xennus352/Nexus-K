import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { gameAccess } from "@/lib/games";
import { siteMaintenance } from "@/lib/maintenance";
import GameNotice from "@/components/GameNotice";
import MaintenanceScreen from "@/components/MaintenanceScreen";

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

  // Proxy the Go engine game via the engine's web client
  const engineUrl = process.env.SLOTOPOL_URL ?? "http://localhost:8080";
  const gameUrl = `${engineUrl}/play/${encodeURIComponent(gameKey)}?uid=${s.uid}&token=${s.token}`;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#0b1020]">
      <iframe
        src={gameUrl}
        className="w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        title="Game"
      />
    </div>
  );
}