import { cookies } from "next/headers";

export async function setSession(userId: number, token: string, email: string) {
  const store = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  };
  store.set("nk_token", token, opts);
  store.set("nk_uid", String(userId), opts);
  store.set("nk_email", email, opts);
}

export async function getSession() {
  const store = await cookies();
  const token = store.get("nk_token")?.value;
  const uid = store.get("nk_uid")?.value;
  const email = store.get("nk_email")?.value;
  if (!token || !uid || !email) return null;
  return { token, uid: Number(uid), email };
}

export async function clearSession() {
  const store = await cookies();
  store.delete("nk_token");
  store.delete("nk_uid");
  store.delete("nk_email");
}
