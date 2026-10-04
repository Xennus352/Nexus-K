// Back-office server actions.
//
// A server action is a public HTTP endpoint: the client chooses the arguments.
// So every action here starts by resolving the admin from the signed `nk_admin`
// cookie and re-reading the `Admin` row — a client cannot claim a role, and a
// blocked admin loses access mid-shift without waiting for cookie expiry.
//
// Actions that change money (approve a deposit, pay a payout, adjust a balance)
// never touch a wallet directly. They call `src/lib/settle.ts` and
// `src/lib/wallet.ts`, which are the only modules allowed to move coins, so the
// ledger and the totals stay consistent no matter who pressed the button.

"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  clearAdminSession,
  requireAdmin,
  setAdminSession,
  type CurrentAdmin,
} from "@/lib/admin-session";
import {
  cancelDeposit,
  cancelWithdrawal,
  payWithdrawal as settlePayWithdrawal,
  settleDeposit,
} from "@/lib/settle";
import { move } from "@/lib/wallet";
import { saveSettings, SETTING_DEFS, invalidateSettings } from "@/lib/settings";
import { driverFor, readConfig, writeConfig } from "@/lib/payments/driver";
import { fiatCurrencies, parseAmount } from "@/lib/money";

/* ------------------------------------------------------------------- utils */

function field(form: FormData, key: string, max = 200): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function num(form: FormData, key: string, fallback = 0): number {
  const n = parseAmount(field(form, key, 40));
  return n === null ? fallback : n;
}

function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "1" || v === "on" || v === "true" || v === "yes";
}

function jsonOf(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return {};
}

/** Re-renders the caller's screen with a message, or bounces on error. */
function done(back: string, message: string): never {
  revalidatePath(back, "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=${encodeURIComponent(message)}`);
}

function fail(back: string, message: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

/**
 * Blocks a non-superadmin from an action. Used by the screens that can change
 * global configuration or hand out admin accounts.
 */
async function superadminOnly(back: string): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") fail(back, "Superadmin access required for this action.");
  return admin;
}

/* -------------------------------------------------------------------- auth */

/**
 * Signs a staff member in.
 *
 * Deliberately credential-based (not the player session): back-office access is
 * a separate namespace, so an operator signed into the casino on the same
 * browser does not inherit admin powers from that cookie.
 */
export async function adminLogin(form: FormData) {
  const username = field(form, "username", 120).toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) fail("/admin/login", "Enter your username and password.");

  const admin = await prisma.admin.findFirst({
    where: { OR: [{ username }, { email: username }] },
  });
  // Same message and roughly the same work for "no such user" and "wrong
  // password", so the form cannot be used to enumerate staff accounts.
  const ok = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!admin || !ok || admin.status !== "active") {
    fail("/admin/login", "Invalid credentials.");
  }

  await setAdminSession({
    id: admin.id,
    username: admin.username,
    email: admin.email,
    name: admin.name,
    role: admin.role as "superadmin" | "admin" | "manager",
  });
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const next = field(form, "next", 200);
  // Only same-origin paths — an attacker-supplied absolute URL here would make
  // this a working open redirect off a login the operator legitimately typed.
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function adminLogout() {
  await clearAdminSession();
  redirect("/admin/login");
}

/* ------------------------------------------------------------------- users */

export async function setUserStatus(form: FormData) {
  const back = `/admin/users/${field(form, "id", 40)}`;
  await requireAdmin();

  const id = field(form, "id", 40);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) fail("/admin/users", "Player not found.");

  const block = form.get("action") === "block";
  await prisma.user.update({
    where: { id },
    data: { status: block ? "blocked" : "active", banReason: block ? field(form, "reason", 200) : "" },
  });
  done(back, block ? `${user.email} suspended.` : `${user.email} reinstated.`);
}

export async function saveUserProfile(form: FormData) {
  const back = `/admin/users/${field(form, "id", 40)}`;
  await requireAdmin();

  const id = field(form, "id", 40);
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) {
    fail("/admin/users", "Player not found.");
  }

  await prisma.user.update({
    where: { id },
    data: {
      firstName: field(form, "firstName", 40),
      lastName: field(form, "lastName", 40),
      phone: field(form, "phone", 40),
      country: field(form, "country", 60),
    },
  });
  done(back, "Profile saved.");
}

/**
 * Credits or debits a player's wallet by hand.
 *
 * This is the one place an operator can create coins out of nothing, so it is
 * superadmin-only and always produces a ledger row with a memo naming the admin
 * who did it.
 */
export async function adjustBalance(form: FormData) {
  const back = `/admin/users/${field(form, "id", 40)}`;
  await superadminOnly(back);

  const id = field(form, "id", 40);
  const amount = num(form, "amount");
  if (amount === 0) fail(back, "Enter a non-zero amount.");
  // Negative values are debits; the UI labels them, but the sign is decided here.
  const signed = field(form, "direction", 10) === "debit" ? -Math.abs(amount) : Math.abs(amount);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) fail(back, "Player not found.");

  const memo = field(form, "memo", 200) || "Manual adjustment";
  const result = await move({
    userId: user.id,
    engineUid: user.engineUid,
    amount: signed,
    type: "adjustment",
    memo: `${memo} (by ${(await requireAdmin()).username})`,
  });
  if (!result.ok) fail(back, result.error);
  done(back, `Balance ${signed > 0 ? "credited" : "debited"} by ${Math.abs(signed).toLocaleString()} coins.`);
}

/* ---------------------------------------------------------------- deposits */

export async function approveDeposit(form: FormData) {
  const back = "/admin/deposits";
  await requireAdmin();

  const id = field(form, "id", 40);
  const deposit = await prisma.deposit.findUnique({ where: { id } });
  if (!deposit) fail(back, "Deposit not found.");

  const result = await settleDeposit(id, {
    reference: field(form, "reference", 200) || undefined,
    adminNote: field(form, "adminNote", 200) || undefined,
  });
  if (!result.ok) fail(back, result.error);
  done(back, `Deposit ${deposit.trx} approved.`);
}

export async function rejectDeposit(form: FormData) {
  const back = "/admin/deposits";
  await requireAdmin();

  const id = field(form, "id", 40);
  const result = await cancelDeposit(id, field(form, "adminNote", 200));
  if (!result.ok) fail(back, result.error);
  if (!result.changed) fail(back, "That deposit is no longer pending.");
  done(back, "Deposit cancelled.");
}

/* ------------------------------------------------------------- withdrawals */

export async function payWithdrawal(form: FormData) {
  const back = "/admin/withdrawals";
  await requireAdmin();

  const id = field(form, "id", 40);
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) fail(back, "Withdrawal not found.");

  // The coins were already reserved when the player requested the payout, so
  // marking it paid is bookkeeping only — never a second wallet movement.
  const result = await settlePayWithdrawal(id, field(form, "adminNote", 200));
  if (!result.ok) fail(back, result.error);
  if (!result.changed) fail(back, "That withdrawal is no longer pending.");
  done(back, `Withdrawal ${w.trx} marked as paid.`);
}

export async function rejectWithdrawal(form: FormData) {
  const back = "/admin/withdrawals";
  await requireAdmin();

  const id = field(form, "id", 40);
  const result = await cancelWithdrawal(id, field(form, "adminNote", 200));
  // A refund can fail after the status flip if the engine is down, so check the
  // error first — the row is already `cancel` and must not be reported as done.
  if (!result.ok) fail(back, `${result.error} The request was cancelled but the refund needs a retry.`);
  if (!result.changed) fail(back, "That withdrawal is no longer pending.");
  done(back, "Withdrawal cancelled and the reserved coins refunded.");
}

/* ---------------------------------------------------------------- tickets */

/** Posts a staff reply and moves the ticket to "answered". */
export async function replyToTicket(form: FormData) {
  const back = `/admin/tickets/${field(form, "ticket", 40)}`;
  await requireAdmin();

  const ticketNo = field(form, "ticket", 40);
  const body = field(form, "body", 4000);
  if (!body) fail(back, "Write a reply first.");
  const ticket = await prisma.supportTicket.findUnique({ where: { ticket: ticketNo } });
  if (!ticket) fail("/admin/tickets", "Ticket not found.");

  const admin = await requireAdmin();
  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        userId: ticket.userId,
        author: admin.username,
        isAdmin: true,
        body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "answered", lastReply: new Date() },
    }),
  ]);
  done(back, "Reply sent.");
}

export async function setTicketStatus(form: FormData) {
  const back = `/admin/tickets/${field(form, "ticket", 40)}`;
  await requireAdmin();

  const status = field(form, "status", 20);
  if (!["open", "answered", "closed"].includes(status)) fail(back, "Unknown ticket status.");

  const ticketNo = field(form, "ticket", 40);
  await prisma.supportTicket.updateMany({ where: { ticket: ticketNo }, data: { status } });
  done(back, `Ticket marked ${status}.`);
}

/* --------------------------------------------------------------------- kyc */

export async function reviewKyc(form: FormData) {
  const back = "/admin/kyc";
  await requireAdmin();

  const id = field(form, "id", 40);
  const status = field(form, "status", 20);
  if (!["approved", "rejected", "pending"].includes(status)) fail(back, "Unknown review decision.");
  if (status === "rejected" && !field(form, "reason", 200)) {
    fail(back, "Give the player a reason for the rejection.");
  }

  await prisma.kycSubmission.update({
    where: { id },
    data: { status, reason: field(form, "reason", 200), reviewedAt: new Date() },
  });
  done(back, `Verification ${status}.`);
}

/* ---------------------------------------------------------------- gateways */

/**
 * Saves a payment rail.
 *
 * Credential fields are merged, not replaced: an empty submitted field means
 * "leave the stored secret alone" so the admin form can render a masked value
 * without ever round-tripping the real key through the browser.
 */
export async function saveGateway(form: FormData) {
  await superadminOnly("/admin/gateways");

  const id = field(form, "id", 40);
  const existing = await prisma.gateway.findUnique({ where: { id } });
  if (!existing) fail("/admin/gateways", "Gateway not found.");

  const driver = field(form, "driver", 30);
  const driverSpec = driverFor({ driver });
  const stored = readConfig(existing.config);
  const config: Record<string, string> = {};
  for (const spec of driverSpec?.fields ?? []) {
    const submitted = String(form.get(`cfg_${spec.key}`) ?? "");
    // An empty box over a stored secret keeps the secret; otherwise take the input.
    config[spec.key] = submitted || (stored[spec.key] ?? "");
  }
  // Switching drivers drops credentials the new driver cannot use, so they never
  // linger in the row (and in a database dump) waiting to be reused.
  if (driver !== existing.driver) {
    for (const key of Object.keys(stored)) {
      if (!config[key]) delete config[key];
    }
  }

  const currencies = field(form, "currencies", 400)
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const known = new Set(fiatCurrencies().map((c) => c.code));
  const usable = currencies.filter((c) => known.has(c) || c === "USDT" || c === "BTC" || c === "ETH");

  const rails = field(form, "rails", 2000)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cut = line.indexOf(":");
      return cut < 0
        ? { label: line, value: "" }
        : { label: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
    })
    .filter((r) => r.label && r.value);

  await prisma.gateway.update({
    where: { id },
    data: {
      name: field(form, "name", 80) || existing.name,
      driver,
      currency: (field(form, "currency", 8) || existing.currency).toUpperCase(),
      currencies: JSON.stringify(usable.length > 0 ? usable : [existing.currency]),
      minAmount: Math.max(0, num(form, "minAmount", existing.minAmount)),
      maxAmount: Math.max(0, num(form, "maxAmount", existing.maxAmount)),
      percentFee: Math.max(0, num(form, "percentFee", existing.percentFee)),
      fixedFee: Math.max(0, num(form, "fixedFee", existing.fixedFee)),
      rate: Math.max(0.0001, num(form, "rate", existing.rate)),
      config: writeConfig(config),
      instructions: field(form, "instructions", 2000),
      rails: JSON.stringify(rails),
      status: bool(form, "status"),
      sort: Math.trunc(num(form, "sort", existing.sort)),
    },
  });

  const configured = driverFor({ driver })?.configured(config) ?? false;
  done(
    "/admin/gateways",
    `${existing.name} saved — ${configured ? "ready for players" : "still missing credentials"}.`,
  );
}

/** Flips a rail's on/off switch without opening the editor. */
export async function toggleGateway(form: FormData) {
  await superadminOnly("/admin/gateways");

  const id = field(form, "id", 40);
  const gateway = await prisma.gateway.findUnique({ where: { id } });
  if (!gateway) fail("/admin/gateways", "Gateway not found.");

  const enable = field(form, "status", 10) === "on";
  await prisma.gateway.update({ where: { id }, data: { status: enable } });
  done("/admin/gateways", `${gateway.name} ${enable ? "enabled" : "disabled"}.`);
}

/* -------------------------------------------------------- withdraw methods */

export async function saveWithdrawMethod(form: FormData) {
  await superadminOnly("/admin/withdraw-methods");

  const id = field(form, "id", 40);
  const existing = await prisma.withdrawMethod.findUnique({ where: { id } });
  if (!existing) fail("/admin/withdraw-methods", "Payout method not found.");

  const fields = field(form, "fields", 4000);
  let parsedFields: unknown;
  try {
    parsedFields = JSON.parse(fields);
  } catch {
    fail(
      "/admin/withdraw-methods",
      "Payout fields must be a JSON array, e.g. [{\"key\":\"accountNumber\",\"label\":\"IBAN\"}]",
    );
  }
  if (!Array.isArray(parsedFields)) fail("/admin/withdraw-methods", "Payout fields must be a JSON array.");

  await prisma.withdrawMethod.update({
    where: { id },
    data: {
      name: field(form, "name", 80) || existing.name,
      currency: (field(form, "currency", 8) || existing.currency).toUpperCase(),
      minAmount: Math.max(0, num(form, "minAmount", existing.minAmount)),
      maxAmount: Math.max(0, num(form, "maxAmount", existing.maxAmount)),
      percentFee: Math.max(0, num(form, "percentFee", existing.percentFee)),
      fixedFee: Math.max(0, num(form, "fixedFee", existing.fixedFee)),
      rate: Math.max(0.0001, num(form, "rate", existing.rate)),
      fields: JSON.stringify(
        parsedFields.filter(
          (f): f is { key: string; label: string; type?: string; optional?: boolean } =>
            !!f &&
            typeof f === "object" &&
            typeof (f as Record<string, unknown>).key === "string" &&
            typeof (f as Record<string, unknown>).label === "string",
        ),
      ),
      status: bool(form, "status"),
      sort: Math.trunc(num(form, "sort", existing.sort)),
    },
  });
  done("/admin/withdraw-methods", `${existing.name} saved.`);
}

export async function toggleWithdrawMethod(form: FormData) {
  await superadminOnly("/admin/withdraw-methods");

  const id = field(form, "id", 40);
  const method = await prisma.withdrawMethod.findUnique({ where: { id } });
  if (!method) fail("/admin/withdraw-methods", "Payout method not found.");

  const enable = field(form, "status", 10) === "on";
  await prisma.withdrawMethod.update({ where: { id }, data: { status: enable } });
  done("/admin/withdraw-methods", `${method.name} ${enable ? "enabled" : "disabled"}.`);
}

/* ------------------------------------------------------------------ staff */

export async function saveAdmin(form: FormData) {
  await superadminOnly("/admin/admins");

  const id = field(form, "id", 40);
  const email = field(form, "email", 120).toLowerCase();
  const username = field(form, "username", 60);
  const role = field(form, "role", 20);
  if (!["superadmin", "admin", "manager"].includes(role)) fail("/admin/admins", "Unknown role.");
  if (!email || !username) fail("/admin/admins", "Username and email are both required.");

  const clash = await prisma.admin.findFirst({
    where: { OR: [{ email }, { username }], ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) fail("/admin/admins", "Another staff account already uses that username or email.");

  const password = String(form.get("password") ?? "");
  if (!id && password.length < 8) fail("/admin/admins", "A new staff account needs a password of 8+ characters.");

  if (id) {
    await prisma.admin.update({
      where: { id },
      data: {
        email,
        username,
        name: field(form, "name", 80),
        role,
        status: bool(form, "status") ? "active" : "blocked",
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      },
    });
    done("/admin/admins", "Staff account updated.");
  }

  await prisma.admin.create({
    data: {
      email,
      username,
      name: field(form, "name", 80),
      role,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  done("/admin/admins", "Staff account created.");
}

/**
 * Blocks a staff account. A superadmin cannot lock themselves out — the last
 * active superadmin check below is what keeps the back office recoverable.
 */
export async function setAdminStatus(form: FormData) {
  const back = "/admin/admins";
  const admin = await superadminOnly(back);

  const id = field(form, "id", 40);
  if (id === admin.id) fail(back, "You cannot change your own access.");

  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) fail(back, "Staff account not found.");
  if (form.get("action") !== "block" && target.role === "superadmin" && (await lastSuperadmin(id))) {
    fail(back, "That is the last active superadmin — promote another one first.");
  }

  await prisma.admin.update({
    where: { id },
    data: { status: form.get("action") === "block" ? "blocked" : "active" },
  });
  done(back, `${target.username} ${target.status === "blocked" ? "reinstated" : "blocked"}.`);
}

async function lastSuperadmin(excludeId: string): Promise<boolean> {
  const others = await prisma.admin.count({
    where: { role: "superadmin", status: "active", NOT: { id: excludeId } },
  });
  return others === 0;
}

/* --------------------------------------------------------------- settings */

/** Persists every known setting from one form; unknown keys are ignored. */
export async function saveSettingsAction(form: FormData) {
  await superadminOnly("/admin/settings");

  const values: Record<string, string> = {};
  for (const def of SETTING_DEFS) {
    // Checkboxes only post when ticked, so an unticked bool has to be read from
    // the absence of the field rather than from a submitted "0".
    values[def.key] =
      def.type === "bool" ? (bool(form, def.key) ? "1" : "0") : field(form, def.key, 2000);
  }
  await saveSettings(values);
  invalidateSettings();
  done("/admin/settings", "Settings saved.");
}

/* ------------------------------------------------------------------ misc */

/** Raw-config escape hatch for rails the form does not cover. */
export async function setGatewayConfig(form: FormData) {
  await superadminOnly("/admin/gateways");

  const id = field(form, "id", 40);
  const gateway = await prisma.gateway.findUnique({ where: { id } });
  if (!gateway) fail("/admin/gateways", "Gateway not found.");

  const merged = { ...readConfig(gateway.config), ...jsonOf(field(form, "config", 4000)) };
  await prisma.gateway.update({ where: { id }, data: { config: writeConfig(merged) } });
  done("/admin/gateways", `${gateway.name} credentials updated.`);
}

/** Lets a superadmin change a blocked account's password from the staff list. */
export async function resetAdminPassword(form: FormData) {
  await superadminOnly("/admin/admins");

  const id = field(form, "id", 40);
  const password = String(form.get("password") ?? "");
  if (password.length < 8) fail("/admin/admins", "Password must be 8+ characters.");

  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) fail("/admin/admins", "Staff account not found.");

  await prisma.admin.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  done("/admin/admins", `Password reset for ${target.username}.`);
}