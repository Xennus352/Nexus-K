"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setSession, clearSession, getSessionUserId } from "@/lib/session";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) {
    redirect("/?error=Invalid+email+or+password+(min+6+chars)");
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) redirect("/?error=Email+already+registered");
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10) },
  });
  await setSession(user.id);
  redirect("/");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/?error=Invalid+credentials");
  }
  await setSession(user.id);
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

const SYMBOLS = ["cherry", "lemon", "orange", "star", "diamond", "bell", "seven"] as const;
const WEIGHTS = [28, 26, 22, 14, 6, 3, 1];
const PAY: Record<string, number> = {
  cherry: 2, lemon: 3, orange: 5, star: 10, diamond: 25, bell: 50, seven: 100,
};

function rollSymbol(): string {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

export type SpinResult = {
  ok: boolean;
  error?: string;
  grid?: string[][]; // 3 rows x 3 cols
  win?: number;
  balance?: number;
};

export async function spin(betCents: number): Promise<SpinResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Not signed in" };
  if (!Number.isInteger(betCents) || betCents <= 0) return { ok: false, error: "Bad bet" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "User not found" };
  if (user.balance < betCents) return { ok: false, error: "Insufficient balance" };

  // 3 columns x 3 rows
  const grid: string[][] = [];
  for (let r = 0; r < 3; r++) {
    grid.push([rollSymbol(), rollSymbol(), rollSymbol()]);
  }

  // win: any row fully matching a symbol
  let win = 0;
  for (const row of grid) {
    if (row[0] === row[1] && row[1] === row[2]) {
      win += betCents * PAY[row[0]];
    }
  }
  // consolation: any two matching on middle row pays bet/2
  const mid = grid[1];
  if (win === 0 && (mid[0] === mid[1] || mid[1] === mid[2] || mid[0] === mid[2])) {
    win += Math.floor(betCents / 2);
  }

  const balance = user.balance - betCents + win;
  await prisma.user.update({ where: { id: userId }, data: { balance } });
  await prisma.spin.create({
    data: { userId, bet: betCents, win, symbols: grid.flat() },
  });

  return { ok: true, grid, win, balance };
}
