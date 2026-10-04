// Player session cookie.
//
// Three separate httpOnly cookies rather than one signed blob: the engine token
// is ~200 bytes of JWT that the game proxy reads on every request, so it is
// kept as its own cookie to stay under the 4 KB browser limit once the session
// is extended with an engine uid and email.
//
// The session is only a cache — every request that matters re-reads the user
// row (and the engine, for balance) rather than trusting cookie contents.

import { cookies } from "next/headers";

const COOKIE = "nk";
const MAX_AGE = 60 * 60 * 24;

type Claims = { email: string; uid: number; token: string; at: number };

export type PlayerSession = {
  email: string;
  uid: number;
  token: string;
  /** When the session was issued, for the "session age" display. */
  at: number;
};

function encode(email: string, uid: number, token: string, at: number): string {
  const json = JSON.stringify({ email, uid, token, at });
  return Buffer.from(json, "utf8").toString("base64url");
}

function decode(raw: string): Claims | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<Claims>;
    if (typeof parsed.email !== "string" || typeof parsed.uid !== "number") return null;
    if (typeof parsed.token !== "string") return null;
    return {
      email: parsed.email,
      uid: parsed.uid,
      token: parsed.token,
      at: typeof parsed.at === "number" ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

export async function setSession(email: string, uid: number, token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, encode(email, uid, token, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<PlayerSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  return decode(raw);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}