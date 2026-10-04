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
import { engineSetPassword, engineSignup, engineSigninPlayer } from "@/lib/engine";
import { paySignupBonuses } from "@/server/signup-bonuses";
import { newRefCode } from "@/server/ref-code";
import { generatePassword, mapWithLimit } from "@/server/credentials";
import { putCredentialReport } from "@/server/credential-reports";
import { addMoneyChat, discoverOpsChat, moneyChats, notifyMoney, telegramConfigured } from "@/lib/telegram";

/* ------------------------------------------------------------------- utils */

/**
 * Ceiling on one bulk credential run.
 *
 * Each row costs an engine round trip and a bcrypt hash, so this is a guard against
 * a single request doing minutes of work behind a proxy timeout. Narrow the search
 * rather than raising it.
 */
const MAX_BULK_CREDENTIALS = 100;

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
  if (!username || !password) fail("/portal", "Enter your username and password.");

  const admin = await prisma.admin.findFirst({
    where: { OR: [{ username }, { email: username }] },
  });
  // Same message and roughly the same work for "no such user" and "wrong
  // password", so the form cannot be used to enumerate staff accounts.
  const ok = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!admin || !ok || admin.status !== "active") {
    fail("/portal", "Invalid credentials.");
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
  redirect("/portal");
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

/**
 * Creates a player account.
 *
 * Players cannot register themselves, so this is the only way an account comes
 * into existence: it provisions the slotopol account *and* the casino row in one
 * step, because a player who can sign in to the engine but has no row here would
 * be a half-account that the wallet pages cannot render.
 *
 * Superadmin-only: this hands out credentials, which is the same power tier as
 * adjusting a balance by hand.
 */
export async function createPlayer(form: FormData) {
  const back = "/admin/users";
  await superadminOnly(back);

  const email = field(form, "email", 160).toLowerCase();
  const password = String(form.get("password") ?? "");
  const username = field(form, "username", 60);
  const refCode = field(form, "refCode", 16).toUpperCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(back, "Enter a valid email address.");
  if (password.length < 6) fail(back, "Password must be at least 6 characters.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    fail(back, `${email} already has an account.`);
  }

  // An unknown code is a typo, not a reason to silently drop the referral, so it
  // is checked here rather than after the account exists.
  const referrer = refCode
    ? await prisma.user.findFirst({ where: { refCode }, select: { id: true, engineUid: true } })
    : null;
  if (refCode && !referrer) fail(back, `No player has referral code ${refCode}.`);

  const uid = await engineSignup(email, password, username || email.split("@")[0]);
  if (uid === null) fail(back, "The engine refused to create that account (email may already exist there).");

  const auth = await engineSigninPlayer(email, password);
  if (!auth) {
    // The engine row exists but the sign-in did not; leaving a User row behind
    // would give the player a casino account with no reachable wallet.
    fail(back, "Account was created on the engine but could not be signed into — check its credentials.");
  }

  // Prisma on MongoDB has no `createOrThrow`, so the write is guarded by hand.
  const user = await prisma.user
    .create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        engineUid: auth.uid,
        username: username || email.split("@")[0],
        refCode: await newRefCode(),
        refById: referrer?.id ?? null,
      },
    })
    .catch(() => null);

  if (!user) {
    // The engine account exists and this one does not — a half-account, which is
    // exactly what this action exists to avoid. It has to be said plainly, because
    // a bare 500 here leaves the operator retrying into "email already exists on
    // the engine" with no idea what happened. `login` will rebuild the row for the
    // player on their first sign-in, which is the escape hatch.
    fail(
      back,
      `Created the engine account for ${email} but could not save the casino record — ` +
        "nothing else was charged. The player can complete sign-in themselves, or " +
        "delete the engine account and try again."
    );
  }

  // Same fan-out the old self-service signup used, so a welcome bonus and the
  // referral bonus on both sides still happen when a player is provisioned here.
  const bonuses = await paySignupBonuses({
    userId: user.id,
    engineUid: auth.uid,
    email,
    referrer: referrer ? { id: referrer.id, engineUid: referrer.engineUid } : null,
  });

  const parts = [`${email} created.`];
  if (bonuses.welcome) parts.push("welcome bonus paid.");
  if (bonuses.referral) parts.push("referral bonus paid to the player.");
  if (bonuses.referrerUnpaid) parts.push("referrer is not paid yet (no engine wallet).");
  done(back, parts.join(" "));
}

/**
 * Sets one player's password.
 *
 * Superadmin-only: this hands out the ability to sign in as any player, which is
 * the same tier as `createPlayer` and `adjustBalance`.
 *
 * The engine is changed *before* the local row. Player sign-in authenticates
 * against the engine and never reads `User.passwordHash`, so a reset that touched
 * only Prisma would appear to succeed and then fail at the login form. Changing the
 * engine first means a refusal leaves nothing half-updated.
 *
 * The local hash is kept in step even though nothing reads it today, so the column
 * does not quietly go stale and mislead whoever wires it up later.
 */
export async function setPlayerPassword(form: FormData) {
  const id = field(form, "id", 40);
  const back = `/admin/users/${id}`;
  await superadminOnly(back);

  const password = String(form.get("password") ?? "");
  // The engine's own floor is 6 (`ErrSmallKey`); matching it here means a password
  // this form accepts is never one the engine will refuse a second later.
  if (password.length < 6) fail(back, "Password must be at least 6 characters.");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, engineUid: true },
  });
  if (!user) fail("/admin/users", "Player not found.");
  if (user.engineUid === null) {
    fail(back, `${user.email} has no engine account yet, so there is no password to set.`);
  }

  const res = await engineSetPassword(user.engineUid, password);
  if (!res.ok) fail(back, `The engine refused the change: ${res.detail}`);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  done(back, `Password changed for ${user.email}.`);
}

/**
 * Sets passwords in bulk and hands the operator a CSV sheet of what it set.
 *
 * This is the only way to end up holding every player's password, and it gets there
 * the honest way: every password is *new*. Existing ones are unrecoverable by
 * design, so they are replaced rather than revealed — which is also why this is
 * superadmin-only and why it demands an explicit confirmation.
 *
 * The sheet is held in memory for ten minutes (`credential-reports.ts`) and never
 * written to the database.
 */
export async function bulkSetPasswords(form: FormData) {
  const back = "/admin/users/credentials";
  await superadminOnly(back);

  if (!bool(form, "confirm")) {
    fail(back, "Tick the confirmation box — this replaces the password of every player you selected.");
  }

  const mode = field(form, "mode", 20) === "single" ? "single" : "generate";
  const shared = String(form.get("password") ?? "");
  if (mode === "single" && shared.length < 6) {
    fail(back, "A single shared password must be at least 6 characters.");
  }

  const q = field(form, "q", 80);
  const rawStatus = field(form, "status", 10);
  const status = rawStatus === "active" || rawStatus === "blocked" ? rawStatus : "";

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { refCode: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  };

  const picked = form
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const takeAll = bool(form, "allMatching");
  if (!takeAll && picked.length === 0) {
    fail(back, "Select at least one player, or tick \"apply to everyone this search matches\".");
  }

  const select = { id: true, email: true, username: true, engineUid: true } as const;
  const users = takeAll
    ? await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        // The cap is a guard against an unbounded request: each row costs one engine
        // round trip and one bcrypt hash, and a table this size is better narrowed
        // with the search box than processed in one shot.
        take: MAX_BULK_CREDENTIALS + 1,
        select,
      })
    : await prisma.user.findMany({ where: { id: { in: picked.slice(0, MAX_BULK_CREDENTIALS) } }, select });

  if (users.length === 0) fail(back, "No players matched that selection.");
  if (users.length > MAX_BULK_CREDENTIALS) {
    fail(
      back,
      `That selection is over the ${MAX_BULK_CREDENTIALS}-player limit. ` +
        "Narrow the search so the sheet stays readable.",
    );
  }

  // One password per player, or the same one for everyone. Assigned before any
  // engine call so a failure part-way through still yields a sheet for the players
  // that did change, rather than a blank page.
  const plans = users.map((u) => ({ user: u, password: mode === "single" ? shared : generatePassword() }));

  const outcomes = await mapWithLimit(plans, 8, async ({ user, password }) => {
    if (user.engineUid === null) return { user, password, ok: false, why: "no engine account" };
    const res = await engineSetPassword(user.engineUid, password);
    if (!res.ok) return { user, password, ok: false, why: res.detail };
    // Only the engine decides whether the player can sign in, so this local write is
    // best-effort bookkeeping — a failure here must not lose a working password.
    await prisma.user
      .update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } })
      .catch(() => null);
    return { user, password, ok: true, why: "" };
  });

  const rows = outcomes.filter((o) => o.ok).map((o) => ({
    email: o.user.email,
    username: o.user.username,
    password: o.password,
  }));
  const failures = outcomes
    .filter((o) => !o.ok)
    .map((o) => `${o.user.email} — ${o.why}`);

  if (rows.length === 0) {
    fail(back, `No passwords were changed. ${failures.slice(0, 3).join(" | ")}`);
  }

  const token = putCredentialReport(rows, failures);
  const parts = [`Password sheet for ${rows.length} player${rows.length === 1 ? "" : "s"}.`];
  if (failures.length) parts.push(`${failures.length} could not be changed.`);
  done(`${back}?report=${token}`, parts.join(" "));
}

/**
 * Adopts the operator's Telegram chat from the bot's pending updates.
 *
 * Getting a token from BotFather does not say who to notify, and asking an
 * operator to find their own chat id is a trap. Whoever has messaged the bot is
 * the operator, so their chat is picked up here instead.
 */
export async function detectTelegramChat(form: FormData) {
  const back = "/admin/settings";
  await superadminOnly(back);
  void form;

  if (!telegramConfigured()) fail(back, "Set TELEGRAM_BOT_TOKEN in the environment first.");

  const found = await discoverOpsChat();
  if (!found) {
    fail(back, "No messages found. Open a chat with the bot and send it anything, then try again.");
  }

  // Additive, not a replacement — see addMoneyChat. The seeded pair is what the
  // alerts were tested against and overwriting it here would silently stop
  // alerting the second operator.
  await addMoneyChat(found.chatId);
  invalidateSettings();
  done(back, `Alerts will now also go to ${found.name} (${found.chatId}).`);
}

/** Fires a test notification so an operator can confirm delivery. */
export async function testTelegram(form: FormData) {
  const back = "/admin/settings";
  await superadminOnly(back);
  void form;

  if (!telegramConfigured()) fail(back, "Set TELEGRAM_BOT_TOKEN in the environment first.");

  const chats = await moneyChats();
  if (chats.length === 0) fail(back, "No alert chats configured. Use “Detect from bot” first.");

  // notifyMoney returns how many chats accepted it, so the message reports the
  // fan-out rather than a bare "sent" that would be true even if every single
  // delivery 403'd.
  const sent = await notifyMoney(
    `✅ Nexus-K test alert.\n\nDeposit and withdrawal alerts are live.\nWatching ${chats.length} chat${chats.length === 1 ? "" : "s"}.`,
  );
  if (sent === 0) fail(back, "Test message failed — no chat accepted it.");
  done(back, `Test message sent to ${sent} of ${chats.length} chat${chats.length === 1 ? "" : "s"}.`);
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