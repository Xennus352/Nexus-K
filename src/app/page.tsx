import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { logout } from "@/server/actions";
import AuthForm from "@/components/AuthForm";
import SlotMachine from "@/components/SlotMachine";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const userId = await getSessionUserId();
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 p-8 text-white">
      <h1 className="bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-5xl font-black text-transparent">
        NEXUS-K 🎰
      </h1>
      <p className="text-zinc-400">Inspired by slotopol, Slot-Machine &amp; live-casino</p>

      {user ? (
        <>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span>{user.email}</span>
            <form action={logout}>
              <button className="rounded-lg border border-zinc-700 px-3 py-1 hover:border-amber-500">Logout</button>
            </form>
          </div>
          <SlotMachine initialBalance={user.balance} />
        </>
      ) : (
        <AuthForm error={error} />
      )}
    </main>
  );
}
