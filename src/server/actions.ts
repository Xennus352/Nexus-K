// Player-facing server actions.
//
// Every action is `'use server'` and starts by resolving the session, because a
// server action is just a public HTTP endpoint: the client can call it with any
// arguments, so nothing may be trusted from the caller.

"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clearSession, getSession, setSession } from "@/lib/session";
import { engineSigninPlayer, engineSignup } from "@/lib/engine";
import { claimBonus } from "@/lib/wallet";
import { paySignupBonuses } from "@/server/signup-bonuses";
import { settingNumber } from "@/lib/settings";
import { randomCode } from "@/lib/ids";

/** Fresh, unguessable referral code, retried on the (unlikely) collision. */
async function newRefCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    const taken = await prisma.user.findFirst({ where: { refCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  return randomCode(12);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}
void clientIp;

/* ------------------------------------------------------------------- auth */

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const refCode = String(formData.get("ref") ?? "").trim().toUpperCase();

  if (!email || password.length < 6) {
    redirect("/?error=Invalid+email+or+password+(min+6+chars)");
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    redirect("/?error=An+account+with+that+email+already+exists");
  }

  const uid = await engineSignup(email, password, email.split("@")[0]);
  if (uid === null) redirect("/?error=Signup+failed+(email+may+exist)");
  const auth = await engineSigninPlayer(email, password);
  if (!auth) redirect("/?error=Signup+ok+but+signin+failed");

  // A referral code is optional; linking it now (rather than at first deposit)
  // is what makes the referrer bonus fire reliably.
  const referrer = refCode
    ? await prisma.user.findFirst({ where: { refCode }, select: { id: true, engineUid: true } })
    : null;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      engineUid: auth.uid,
      username: email.split("@")[0],
      refCode: await newRefCode(),
      refById: referrer?.id ?? null,
      lastLoginAt: new Date(),
    },
  });

  await paySignupBonuses({
    userId: user.id,
    engineUid: auth.uid,
    email,
    referrer: referrer ? { id: referrer.id, engineUid: referrer.engineUid } : null,
  });

  await setSession(email, auth.uid, auth.access);
  redirect("/lobby");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const auth = await engineSigninPlayer(email, password);
  if (!auth) redirect("/?error=Invalid+credentials");

  let user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status !== "active") {
    redirect("/?error=This+account+has+been+suspended");
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        engineUid: auth.uid,
        username: email.split("@")[0],
        refCode: await newRefCode(),
        lastLoginAt: new Date(),
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { engineUid: auth.uid, lastLoginAt: new Date() },
    });
  }

  await setSession(email, auth.uid, auth.access);
  redirect("/lobby");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

/* ---------------------------------------------------------------- profile */

export async function saveProfile(formData: FormData) {
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user) redirect("/?error=Account+not+found");

  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, 40);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 40);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 40);
  const country = String(formData.get("country") ?? "").trim().slice(0, 60);

  await prisma.user.update({
    where: { id: user.id },
    data: { firstName, lastName, phone, country },
  });
  revalidatePath("/wallet");
  revalidatePath("/profile");
}

/** UTC day key used to make the daily bonus claim idempotent. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function claimDailyBonus() {
  const s = await getSession();
  if (!s) redirect("/?error=Login+required");
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user) redirect("/?error=Account+not+found");

  const amount = await settingNumber("bonus.daily", 0);
  if (amount <= 0) redirect("/?error=The+daily+bonus+is+currently+disabled");

  const result = await claimBonus({
    userId: user.id,
    engineUid: user.engineUid,
    kind: "daily",
    amount,
    memo: "Daily bonus",
    period: todayKey(),
  });
  if (!result.ok) redirect(`/?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ spins */

export async function logSpin(alias: string, bet: number, win: number) {
  const s = await getSession();
  if (!s) return;
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user) return;

  await prisma.spin.create({ data: { userId: user.id, alias, bet, win } });
  // Running totals drive the turnover check that gates withdrawals, so they are
  // kept as increments rather than recomputed from the spin log.
  if (bet > 0 || win > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { totalBet: { increment: bet }, totalWin: { increment: win } },
    });
  }
}