// Admin session cookie.
//
// Deliberately a *separate* cookie namespace from the player session: a support
// agent browsing the casino must not silently acquire admin powers because they
// happen to share a browser with the back office.
//
// The cookie is HMAC-signed with SESSION_SECRET so a role cannot be edited
// client-side, and every read is re-checked against the `Admin` row so a blocked
// or deleted admin loses access immediately rather than at cookie expiry.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const COOKIE = "nk_admin";
const MAX_AGE = 60 * 60 * 8; // an admin shift, not a week.

export type AdminRole = "superadmin" | "admin" | "manager";

export type AdminSession = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: AdminRole;
};

type Claims = AdminSession & { at: number };

function secret(): string {
  return process.env.SESSION_SECRET ?? "nexus-k-dev-secret";
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function pack(claims: Claims): string {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${mac(body)}`;
}

function unpack(raw: string): Claims | null {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(mac(body));
  // Constant-time compare so the signature cannot be brute-forced byte by byte.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    if (typeof claims.id !== "string" || typeof claims.username !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}

export async function setAdminSession(admin: AdminSession): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, pack({ ...admin, at: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const claims = unpack(raw);
  if (!claims) return null;
  const { id, username, email, name, role } = claims;
  return { id, username, email, name, role };
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export type CurrentAdmin = AdminSession & { lastLoginAt: Date | null };

/**
 * The admin a session points at, re-read on every protected page. Redirects to
 * the login screen when there is no valid session or the account is not active.
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const row = await prisma.admin.findUnique({ where: { id: session.id } });
  if (!row || row.status !== "active") {
    await clearAdminSession();
    redirect("/admin/login?error=Your+admin+account+is+not+active");
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role as AdminRole,
    lastLoginAt: row.lastLoginAt,
  };
}

/** Same check without the redirect, for route handlers. */
export async function adminOrNull(): Promise<AdminSession | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const row = await prisma.admin.findUnique({ where: { id: session.id } });
  if (!row || row.status !== "active") return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role as AdminRole,
  };
}

/** Blocks anyone but a superadmin from destructive back-office screens. */
export async function requireSuperAdmin(): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") redirect("/admin?error=Superadmin+access+required");
  return admin;
}