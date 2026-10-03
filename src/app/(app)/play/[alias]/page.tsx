import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Player from "./Player";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const { alias } = await params;
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 p-6 text-white">
      <Player uid={s.uid} alias={decodeURIComponent(alias)} />
    </main>
  );
}
