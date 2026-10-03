import { getSession } from "@/lib/session";
import { logout } from "@/server/actions";
import AuthForm from "@/components/AuthForm";
import Link from "next/link";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const s = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 p-8 text-white">
      <h1 className="bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-5xl font-black text-transparent">
        NEXUS-K 🎰
      </h1>
      {s ? (
        <>
          <p className="text-zinc-400">Signed in as {s.email}</p>
          <Link href="/lobby" className="rounded-xl bg-amber-500 px-10 py-4 text-xl font-black text-black">
            ENTER LOBBY
          </Link>
          <form action={logout}>
            <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">Logout</button>
          </form>
        </>
      ) : (
        <AuthForm error={error} />
      )}
    </main>
  );
}
