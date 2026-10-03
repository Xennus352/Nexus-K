import { login, signup } from "@/server/actions";

export default function AuthForm({ error }: { error?: string }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
      <h2 className="mb-6 text-center text-2xl font-bold text-amber-400">Join Nexus-K</h2>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <form action={signup} className="mb-6 flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded-lg bg-zinc-800 px-4 py-2 text-white" />
        <input name="password" type="password" placeholder="Password (min 6)" required className="rounded-lg bg-zinc-800 px-4 py-2 text-white" />
        <button className="rounded-lg bg-amber-500 py-2 font-bold text-black">Sign Up</button>
      </form>
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded-lg bg-zinc-800 px-4 py-2 text-white" />
        <input name="password" type="password" placeholder="Password" required className="rounded-lg bg-zinc-800 px-4 py-2 text-white" />
        <button className="rounded-lg border border-amber-500 py-2 font-bold text-amber-400">Log In</button>
      </form>
    </div>
  );
}
