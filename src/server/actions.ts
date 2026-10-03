"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setSession, clearSession } from "@/lib/session";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

async function engineSignin(email: string, secret: string) {
  const res = await fetch(`${ENGINE}/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { uid: number; access: string };
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) {
    redirect("/?error=Invalid+email+or+password+(min+6+chars)");
  }
  const res = await fetch(`${ENGINE}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret: password, name: email.split("@")[0] }),
  });
  if (!res.ok) redirect("/?error=Signup+failed+(email+may+exist)");
  const { uid } = (await res.json()) as { uid: number };
  const auth = await engineSignin(email, password);
  if (!auth) redirect("/?error=Signup+ok+but+signin+failed");
  await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), engineUid: uid },
  });
  await setSession(uid, auth.access, email);
  redirect("/lobby");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const auth = await engineSignin(email, password);
  if (!auth) redirect("/?error=Invalid+credentials");
  await prisma.user.upsert({
    where: { email },
    update: { engineUid: auth.uid },
    create: { email, passwordHash: await bcrypt.hash(password, 10), engineUid: auth.uid },
  });
  await setSession(auth.uid, auth.access, email);
  redirect("/lobby");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

export async function logSpin(alias: string, bet: number, win: number) {
  const { getSession } = await import("@/lib/session");
  const s = await getSession();
  if (!s) return;
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user) return;
  await prisma.spin.create({ data: { userId: user.id, alias, bet, win } });
}

async function engineAdd(sum: number) {
  const { getSession } = await import("@/lib/session");
  const s = await getSession();
  if (!s) return;
  await fetch(`${ENGINE}/prop/wallet/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.token}`,
    },
    body: JSON.stringify({ cid: 1, uid: s.uid, sum }),
  });
}

export async function addFunds() {
  await engineAdd(1000);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
}

export async function claimBonus() {
  await engineAdd(250);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
}
