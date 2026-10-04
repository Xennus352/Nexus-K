// Server-side access to the slotopol engine.
//
// The engine owns every play balance. Player tokens can read their own wallet
// but cannot move coins: `/prop/wallet/add` requires the caller to hold the
// ALbooker permission, which only engine admins get. So all casino-side wallet
// movement (deposit credits, withdrawal debits, bonus payouts, admin
// adjustments) goes through a cached engine-admin token.

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

/** Club the whole app plays in. 1 = "virtual" in the bundled engine config. */
export const CID = 1;

/** Upper bound of a single wallet movement (engine `adjunct-limit`). */
const MOVEMENT_LIMIT = 100000;

export type EngineUser = { uid: number; access: string };

type CachedAdmin = { token: string; at: number };

// Survives across requests within a single server process; re-signed in if the
// engine is restarted or the token ages out.
const globalCache = globalThis as unknown as { __nkEngineAdmin?: CachedAdmin };

/** Engine admin credentials, overridable for a non-default engine install. */
function adminCreds() {
  return {
    email: process.env.SLOTOPOL_ADMIN_EMAIL ?? "admin@example.org",
    secret: process.env.SLOTOPOL_ADMIN_SECRET ?? "0YBoaT",
  };
}

async function signin(email: string, secret: string): Promise<EngineUser | null> {
  const res = await fetch(`${ENGINE}/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { uid?: number; access?: string };
  if (typeof json.uid !== "number" || !json.access) return null;
  return { uid: json.uid, access: json.access };
}

/** Signs in (and memoises) the engine admin used for wallet movements. */
export async function engineAdmin(): Promise<EngineUser> {
  const cached = globalCache.__nkEngineAdmin;
  // Tokens live for days; an hour of memoising keeps a busy process from
  // re-authenticating on every single movement while still recovering quickly.
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) {
    return { uid: 0, access: cached.token };
  }
  const { email, secret } = adminCreds();
  const auth = await signin(email, secret);
  if (!auth) {
    throw new Error(
      `engine admin sign-in failed for ${email} at ${ENGINE} — set SLOTOPOL_ADMIN_EMAIL / SLOTOPOL_ADMIN_SECRET`,
    );
  }
  globalCache.__nkEngineAdmin = { token: auth.access, at: Date.now() };
  return auth;
}

/** Drops the memoised admin token, e.g. after a 403 so the next call re-auths. */
export function forgetEngineAdmin() {
  delete globalCache.__nkEngineAdmin;
}

export type WalletResult = { wallet: number };

async function walletCall(
  path: string,
  body: Record<string, unknown>,
  retry = true,
): Promise<WalletResult | null> {
  let auth: EngineUser;
  try {
    auth = await engineAdmin();
  } catch {
    return null;
  }
  const res = await fetch(`${ENGINE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.access}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    // Stale admin token — re-auth once and try again.
    forgetEngineAdmin();
    if (retry) return walletCall(path, body, false);
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as WalletResult | null;
  return json && typeof json.wallet === "number" ? json : null;
}

/** Reads a player's engine wallet. Works for the engine's own uid or any user. */
export function engineWalletGet(uid: number): Promise<WalletResult | null> {
  return walletCall("/prop/wallet/get", { cid: CID, uid });
}

/**
 * Moves a player's wallet. Positive `sum` credits, negative debits.
 *
 * Returns the resulting balance, or null when the engine refused (unknown user,
 * engine offline, or a debit that would overdraw the balance).
 */
export function engineWalletAdd(uid: number, sum: number): Promise<WalletResult | null> {
  if (!Number.isFinite(sum) || sum === 0) return Promise.resolve(null);
  if (Math.abs(sum) > MOVEMENT_LIMIT) {
    // The engine caps a single adjunct; splitting is the caller's decision, so
    // refuse loudly rather than silently moving a partial amount.
    return Promise.reject(
      new Error(`wallet movement ${sum} exceeds the engine limit of ${MOVEMENT_LIMIT}`),
    );
  }
  return walletCall("/prop/wallet/add", { cid: CID, uid, sum });
}

/** True when the engine is reachable and the admin credentials work. */
export async function engineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE}/ping`, { cache: "no-store" });
    if (!res.ok) return false;
    return (await engineAdmin()).access.length > 0;
  } catch {
    return false;
  }
}

/** Registers a player in the engine. Called on first sign-up. */
export async function engineSignup(
  email: string,
  secret: string,
  name: string,
): Promise<number | null> {
  const res = await fetch(`${ENGINE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret, name }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { uid?: number } | null;
  return typeof json?.uid === "number" ? json.uid : null;
}

/**
 * Signs a *player* in and returns their engine access token.
 *
 * This token can read and spend their own wallet but holds no ALbooker
 * permission, so it can never be used to credit or debit coins directly — see
 * engineWalletAdd.
 */
export async function engineSigninPlayer(
  email: string,
  secret: string,
): Promise<EngineUser | null> {
  return signin(email, secret);
}

export function engineUrl(): string {
  return ENGINE;
}