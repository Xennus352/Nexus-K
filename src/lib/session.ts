import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "nk_session";

function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "dev-secret")
    .update(value)
    .digest("hex");
}

export async function setSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;
  const expected = sign(userId);
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return userId;
  } catch {
    /* length mismatch */
  }
  return null;
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}
