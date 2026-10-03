import { login, signup } from "@/server/actions";

export default function AuthForm({ error }: { error?: string }) {
  return (
    <div className="w-full max-w-sm rounded-3xl border border-sky-500/20 bg-[#0b1533]/80 p-8 shadow-[0_0_60px_rgba(56,189,248,0.15)] backdrop-blur">
      <h2 className="mb-6 text-center text-2xl font-black text-sky-300">Enter the Vault</h2>
      {error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <form action={signup} className="mb-6 flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded-xl border border-white/10 bg-[#070d24] px-4 py-2.5 outline-none focus:border-sky-500" />
        <input name="password" type="password" placeholder="Password (min 6)" required className="rounded-xl border border-white/10 bg-[#070d24] px-4 py-2.5 outline-none focus:border-sky-500" />
        <button className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 py-2.5 font-bold shadow-[0_0_20px_rgba(56,189,248,0.4)] transition hover:brightness-110">Sign Up</button>
      </form>
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded-xl border border-white/10 bg-[#070d24] px-4 py-2.5 outline-none focus:border-sky-500" />
        <input name="password" type="password" placeholder="Password" required className="rounded-xl border border-white/10 bg-[#070d24] px-4 py-2.5 outline-none focus:border-sky-500" />
        <button className="rounded-xl border border-sky-500/40 py-2.5 font-bold text-sky-300 transition hover:bg-sky-500/10">Log In</button>
      </form>
    </div>
  );
}
