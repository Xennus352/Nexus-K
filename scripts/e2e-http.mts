/**
 * HTTP-level end-to-end test: drives the real app over HTTP, the way a browser
 * does, and asserts coins moved correctly.
 *
 * `e2e-money.mts` covers the settlement *logic* in isolation. This covers the
 * wiring around it — session cookies, the player API routes, and the admin
 * buttons — which is where the bugs that survive a logic-only test live. It
 * replays each admin form by scraping the rendered HTML for its `$ACTION_ID`
 * and POSTing it back, exactly as React's progressive-enhancement path does, so
 * a server action that is never wired to a form fails here.
 *
 * Requires the engine and `pnpm start` on $APP_URL.
 *
 *   pnpm db:e2e:http
 */
import { prisma } from "@/lib/prisma";
import { engineWalletGet, engineSigninPlayer, CID } from "@/lib/engine";
import { settingNumber } from "@/lib/settings";
import { randomBytes } from "node:crypto";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@nexus-k.test";

let failures = 0;
const failedLabels: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) {
    failures++;
    failedLabels.push(label);
  }
}

/* ------------------------------------------------------------------ helpers */

/** Full `Cookie` header values — the name is part of the credential. */
const session = { cookie: "", engineUid: 0, userId: "" };

async function api(
  path: string,
  init: { method?: string; form?: Record<string, string>; cookie?: string } = {},
): Promise<{ status: number; json: Record<string, unknown>; location: string }> {
  const body = init.form ? new FormData() : undefined;
  if (init.form) for (const [k, v] of Object.entries(init.form)) body!.set(k, v);
  const res = await fetch(`${APP}${path}`, {
    method: init.method ?? (body ? "POST" : "GET"),
    body,
    redirect: "manual",
    headers: { cookie: init.cookie ?? session.cookie },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* html page */
  }
  return { status: res.status, json, location: res.headers.get("location") ?? "" };
}

async function html(path: string, cookie: string): Promise<string> {
  const res = await fetch(`${APP}${path}`, { headers: { cookie } });
  return res.text();
}

async function wallet(): Promise<number> {
  const res = await engineWalletGet(session.engineUid);
  return res?.wallet ?? -1;
}

/**
 * Finds the admin form whose submit button mentions `label` and replays it.
 * Returns the action id so callers can post the same form more than once.
 */
function findActionId(page: string, label: string): string | null {
  for (const form of page.match(/<form\b[\s\S]*?<\/form>/g) ?? []) {
    if (!form.includes(label) || !form.includes("$ACTION_ID_")) continue;
    const id = /name="(\$ACTION_ID_[a-f0-9]+)"/.exec(form)?.[1];
    if (id) return id;
  }
  return null;
}

/** The hidden `id` value inside the form that carries `actionId`. */
function formField(page: string, actionId: string, field: string): string {
  for (const form of page.match(/<form\b[\s\S]*?<\/form>/g) ?? []) {
    if (!form.includes(actionId)) continue;
    return new RegExp(`name="${field}" value="([^"]*)"`).exec(form)?.[1] ?? "";
  }
  return "";
}

/* --------------------------------------------------------------------- main */

async function main() {
  console.log(`\n=== http e2e against ${APP}\n`);

  // A reachable engine is a precondition: every assertion below compares against
  // the live wallet, so failing fast beats a wall of confusing diffs.
  const ping = await fetch(`${process.env.SLOTOPOL_URL ?? "http://localhost:8080"}/ping`).catch(() => null);
  if (!ping?.ok) throw new Error("engine is not reachable on SLOTOPOL_URL");

  /* ------------------------------------------------------------ admin cookie */
  // Minted first, before a single request goes out to the app.
  //
  // This spawns `tsx`, which is synchronous: it blocks the event loop for a couple
  // of seconds. Any keep-alive socket opened before that goes stale while the loop
  // is blocked, and undici then hands the next request a half-closed socket — the
  // server reads it, starts streaming, and the connection dies mid-body. It shows
  // up as `fetch failed / UND_ERR_SOCKET`, which looks like a server bug and is
  // not one. Minting up front keeps the blocking call away from live connections.
  const { execFileSync } = await import("node:child_process");
  const minted = execFileSync(
    "npx",
    ["tsx", "--env-file=.env", "scripts/mint-admin-cookie.mts", ADMIN_EMAIL],
    { encoding: "utf8" },
  );
  const adminCookie = /^nk_admin=(.+)$/m.exec(minted.trim())?.[1] ?? "";
  if (!adminCookie) throw new Error("could not mint an admin cookie");
  const adminHeader = `nk_admin=${adminCookie}`;

  // Same reasoning for the player session: this is the second blocking spawn, so
  // it belongs here too rather than halfway through the money checks.
  //
  // `mint-player-cookie.mts` owns test-fixture registration: it signs the player
  // up in the engine and creates the mongo row in one place, so the assertions
  // below cannot drift from what a real account looks like. The player-facing
  // signup form is gone, so this is no longer how accounts are made — it is just
  // how this script gets a session to drive the payment routes with.
  const email = `http-${randomBytes(4).toString("hex")}@nexus-k.test`;
  const password = randomBytes(8).toString("hex");
  const player = execFileSync(
    "npx",
    ["tsx", "--env-file=.env", "scripts/mint-player-cookie.mts", email, password],
    { encoding: "utf8" },
  );
  session.cookie = `nk=${/^nk=(.+)$/m.exec(player.trim())?.[1] ?? ""}`;
  session.engineUid = Number(/^# uid\s+(\d+)/m.exec(player)?.[1] ?? 0);
  if (session.cookie === "nk=" || !session.engineUid) throw new Error("could not mint a player cookie");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("player row missing after mint");
  session.userId = user.id;

  // The staff sign-in moved to /portal; /admin/login is kept as a redirect so old
  // bookmarks still land somewhere useful. Both are checked: one must render, the
  // other must bounce.
  const portalRes = await fetch(`${APP}/portal`);
  check("staff portal is reachable", portalRes.status, 200);

  const legacyLogin = await fetch(`${APP}/admin/login`, { redirect: "manual" });
  check(
    "/admin/login redirects to /portal",
    legacyLogin.headers.get("location"),
    "/portal"
  );

  const adminPage = await html("/admin", adminHeader);
  check("admin cookie opens the dashboard", adminPage.includes("BACK OFFICE"), true);

  /* --------------------------------------- the back office provisions players */
  // Public registration is gone, so `createPlayer` on /admin/users is the only way
  // an account comes into existence. It is exercised here through the real form —
  // scraped $ACTION_ID, multipart POST — rather than by calling the action
  // in-process, because it depends on the admin cookie and would otherwise be
  // tested without the permission check that matters most.
  const welcome = await settingNumber("bonus.welcome", 0);
  const referral = await settingNumber("bonus.referral", 0);

  const usersPage = await html("/admin/users", adminHeader);
  const createAction = findActionId(usersPage, "Create account");
  if (!createAction) throw new Error("no create-player form on /admin/users — the action is not wired");

  const first = `prov-${randomBytes(4).toString("hex")}@nexus-k.test`;
  const firstPass = randomBytes(8).toString("hex");
  const created = await api("/admin/users", {
    form: {
      [createAction]: "",
      email: first,
      password: firstPass,
      username: "prov1",
      refCode: "",
    },
    cookie: adminHeader,
  });
  check("create player redirects", created.status, 303);
  check("create player reports success", created.location.includes("ok="), true);

  const row = await prisma.user.findUnique({ where: { email: first } });
  check("the casino row exists", row !== null, true);
  check("it is bound to an engine account", typeof row?.engineUid === "number", true);
  check("it was given a referral code", (row?.refCode ?? "").length > 0, true);

  // The engine account must exist with the same password, or the player could
  // never actually sign in to the app we just created a row for.
  const auth = await engineSigninPlayer(first, firstPass);
  check("the engine accepts the new credentials", auth !== null, true);

  // New engine accounts are granted a starting balance (1000 in the bundled
  // engine); the welcome bonus is added on top, and that part is what this action
  // is responsible for. Asserted as "at least the grant plus the bonus" so the
  // check does not break if the engine's own grant is ever changed.
  const granted = (await engineWalletGet(auth?.uid ?? 0))?.wallet ?? 0;
  check("the welcome bonus was credited", granted - welcome >= 1000, true);

  // Replaying the same form must not create a second player or double-pay.
  const dup = await api("/admin/users", {
    form: { [createAction]: "", email: first, password: firstPass, username: "prov1", refCode: "" },
    cookie: adminHeader,
  });
  check("a duplicate email is refused", dup.location.includes("error="), true);
  check(
    "the duplicate created nothing",
    await prisma.user.count({ where: { email: first } }),
    1
  );

  /* ------------------------------------------- a referred player pays both sides */
  const second = `prov-${randomBytes(4).toString("hex")}@nexus-k.test`;
  const secondPass = randomBytes(8).toString("hex");
  const beforeReferrer = (await engineWalletGet(row?.engineUid ?? 0))?.wallet ?? 0;

  const referred = await api("/admin/users", {
    form: {
      [createAction]: "",
      email: second,
      password: secondPass,
      username: "prov2",
      refCode: row?.refCode ?? "",
    },
    cookie: adminHeader,
  });
  check("a referred player is created", referred.location.includes("ok="), true);

  const child = await prisma.user.findUnique({ where: { email: second } });
  check("the referral is linked", child?.refById, row?.id);
  check(
    "the referrer was paid their side",
    (await engineWalletGet(row?.engineUid ?? 0))?.wallet,
    beforeReferrer + referral
  );

  const childAuth = await engineSigninPlayer(second, secondPass);
  const childWallet = (await engineWalletGet(childAuth?.uid ?? 0))?.wallet ?? 0;
  check(
    "the referred player was paid their side",
    childWallet - welcome - referral >= 1000,
    true
  );

  // A typo in the code is an operator mistake, not a reason to drop the referral.
  const badRef = await api("/admin/users", {
    form: {
      [createAction]: "",
      email: `prov-${randomBytes(4).toString("hex")}@nexus-k.test`,
      password: randomBytes(8).toString("hex"),
      username: "prov3",
      refCode: "NOSUCHCODE",
    },
    cookie: adminHeader,
  });
  check("an unknown referral code is refused", badRef.location.includes("error="), true);

  /* ------------------------------------------------ setting a player's password */
  // There is no way to *read* a password — it is bcrypt here and a hashed secret in
  // the engine — so the back office replaces them instead. That path has to reach the
  // engine, because player sign-in authenticates there and never reads the local
  // hash: a reset that touched only Prisma would look like it worked and then fail
  // at the login form.
  const detailPage = await html(`/admin/users/${row!.id}`, adminHeader);
  const setPassAction = findActionId(detailPage, "Set password");
  if (!setPassAction) throw new Error("no set-password form on the player page");
  check("the player page offers a set-password form", setPassAction !== null, true);

  const shortPass = await api(`/admin/users/${row!.id}`, {
    form: { [setPassAction]: "", id: row!.id, password: "abc" },
    cookie: adminHeader,
  });
  check("a password under the engine's 6-character floor is refused", shortPass.location.includes("error="), true);

  const operatorPass = randomBytes(8).toString("hex");
  const reset = await api(`/admin/users/${row!.id}`, {
    form: { [setPassAction]: "", id: row!.id, password: operatorPass },
    cookie: adminHeader,
  });
  check("setting a password redirects", reset.status, 303);
  check("setting a password reports success", reset.location.includes("ok="), true);
  check("the engine accepts the password it was just given", (await engineSigninPlayer(first, operatorPass)) !== null, true);
  check("the password it replaced no longer works", (await engineSigninPlayer(first, firstPass)) === null, true);

  const rehashed = await prisma.user.findUnique({ where: { id: row!.id }, select: { passwordHash: true } });
  check("the local hash was brought into step", rehashed?.passwordHash !== row!.passwordHash, true);

  /* ------------------------------------------------------- the bulk credential sheet */
  // The one screen that ends up holding every player's password, so both halves of
  // its guard are asserted: the confirmation box, and the superadmin check on the
  // action itself (a server action is a public endpoint — hiding the form proves
  // nothing on its own).
  const credsPage = await html("/admin/users/credentials", adminHeader);
  const bulkAction = findActionId(credsPage, "Set passwords and build the sheet");
  if (!bulkAction) throw new Error("no bulk-credentials form — the action is not wired");

  const unconfirmed = await api("/admin/users/credentials", {
    form: { [bulkAction]: "", q: first, status: "", mode: "generate" },
    cookie: adminHeader,
  });
  check("a bulk run without confirmation is refused", unconfirmed.location.includes("error="), true);
  check("and it issues no report", unconfirmed.location.includes("report="), false);

  const bulk = await api("/admin/users/credentials", {
    form: {
      [bulkAction]: "",
      q: first,
      status: "",
      mode: "generate",
      confirm: "1",
      allMatching: "1",
    },
    cookie: adminHeader,
  });
  check("a confirmed bulk run redirects with a report", bulk.location.includes("report="), true);

  // The generated password must be real, not a rendering artefact: it has to work
  // against the engine, and the sheet it came from has to say so.
  const reportToken = /report=([a-f0-9]+)/.exec(bulk.location)?.[1] ?? "";
  const reportPage = await html(`/admin/users/credentials?report=${reportToken}`, adminHeader);
  const raw = /aria-label="Generated credentials"[^>]*>([\s\S]*?)<\/textarea>/.exec(reportPage)?.[1] ?? "";
  // A <textarea> holds RCDATA, so the browser decodes entities when it displays the
  // value — and a generated password can contain `&`, which React writes as `&amp;`.
  // Reading the markup without undoing that would hand the engine a mangled secret
  // and look like a broken generator.
  const sheet = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  const sheetLines = sheet.trim().split("\n");
  check("the sheet has a header and one row", sheetLines.length, 2);
  check("the sheet names the player", sheetLines[1]?.startsWith(`${first},`), true);
  // The generated alphabet excludes `,` and `"`, so a plain split is exact.
  const generated = (sheetLines[1] ?? "").split(",")[2] ?? "";
  check("the generated password is 12 characters", generated.length, 12);
  check("the generated password actually signs in", (await engineSigninPlayer(first, generated)) !== null, true);

  // A guessed or expired token must render the notice, never an empty sheet that
  // could be mistaken for "no players matched".
  const bogus = await html("/admin/users/credentials?report=" + "0".repeat(64), adminHeader);
  check("a bogus report token yields no sheet", bogus.includes("aria-label=\"Generated credentials\""), false);
  check("a bogus report token explains itself", bogus.includes("expired or the server restarted"), true);

  /* --------------------------------------------------------- create a player */
  // The session was minted at the top of the run, next to the admin cookie.
  const start = await wallet();
  check("player starts with the engine's grant", start >= 1000, true);
  // Player pages stream a loading shell and redirect client-side when signed out,
// so the meaningful check is that the *mutations* refuse an anonymous caller.
  const anonDeposit = await api("/api/payments/checkout", {
    form: { gatewayId: "x", amount: "10", currency: "USD" },
    cookie: "",
  });
  check("signed-out deposit checkout is refused", anonDeposit.status, 401);
  const anonWithdraw = await api("/api/withdrawals", { form: { amount: "10" }, cookie: "" });
  check("signed-out withdrawal is refused", anonWithdraw.status, 401);

  /* ------------------------------------------------------------- the deposit */
  const manual = await prisma.gateway.findFirst({ where: { alias: "Manual", status: true } });
  if (!manual) throw new Error("no enabled Manual gateway — run pnpm db:seed");

  const depPage = await html("/deposit", session.cookie);
  check("deposit page lists the manual rail", depPage.includes("Manual"), true);

  const checkout = await api("/api/payments/checkout", {
    form: { gatewayId: manual.id, amount: "40", currency: "USD" },
  });
  check("checkout succeeds", checkout.status, 200);
  const trx = String(checkout.json.trx ?? "");
  check("checkout quotes the coins it will credit", checkout.json.coins, 40);
  check("manual rail sends the player to the instructions page", checkout.json.redirect, `/deposit/${trx}`);
  check("instructions page renders", (await api(`/deposit/${trx}`)).status, 200);

  /* ------------------------------------------------------- admin approves it */
  const depositsPage = await html("/admin/deposits", adminHeader);
  check("pending deposit appears in the back office", depositsPage.includes(trx), true);

  const approveAction = findActionId(depositsPage, "Approve");
  if (!approveAction) throw new Error("no approve form on /admin/deposits — the action is not wired");
  const approveId = formField(depositsPage, approveAction, "id");
  check("approve form targets the deposit", approveId.length > 0, true);

  const beforeApprove = await wallet();
  const approve = await api("/admin/deposits", {
    form: {
      [approveAction]: "",
      id: approveId,
      reference: "http-e2e",
      adminNote: "matched statement",
    },
    cookie: adminHeader,
  });
  check("approve redirects", approve.status, 303);
  check("approve reports success", approve.location.includes("ok="), true);
  check("deposit is settled", (await api(`/api/payments/status/${trx}`)).json.status, "success");
  check("approve credited exactly the quoted coins", await wallet(), beforeApprove + 40);

  // The replay path: a double-click or a retried webhook must not pay twice.
  const replay = await api("/admin/deposits", {
    form: { [approveAction]: "", id: approveId, adminNote: "double click" },
    cookie: adminHeader,
  });
  check("replayed approve still redirects", replay.status, 303);
  check("replayed approve credits nothing", await wallet(), beforeApprove + 40);

  /* --------------------------------------------------------- the withdrawal */
  const method = await prisma.withdrawMethod.findFirst({ where: { code: "bank", status: true } });
  if (!method) throw new Error("no enabled bank payout method — run pnpm db:seed");
  const fields = JSON.parse(method.fields) as { key: string; optional?: boolean }[];

  const tooSmall = await api("/api/withdrawals", {
    form: { methodId: method.id, amount: "1", ...Object.fromEntries(fields.map((f) => [f.key, "x"])) },
  });
  check("below-minimum withdrawal is refused", tooSmall.status, 400);

  const details: Record<string, string> = {};
  for (const f of fields) details[f.key] = f.optional ? "" : "1234567890";

  // The turnover rule blocks cashing out a deposit that has never been wagered,
  // so a fresh depositor cannot withdraw. Assert that, then satisfy it.
  const blocked = await api("/api/withdrawals", {
    form: { methodId: method.id, amount: "100", ...details },
  });
  check("turnover rule blocks an unwagered withdrawal", blocked.status, 400);
  check("turnover refusal explains itself", String(blocked.json.error ?? "").includes("wager"), true);

  // `totalBet` is written by the engine's game session. This test is about the
  // payout wiring, not about playing slots, so the wagering is recorded directly
  // rather than driving a real game round through the engine.
  await prisma.user.update({ where: { id: session.userId }, data: { totalBet: 10_000 } });

  const beforeWithdraw = await wallet();
  const wdl = await api("/api/withdrawals", {
    form: { methodId: method.id, amount: "100", ...details },
  });
  check("withdrawal request succeeds", wdl.status, 200);
  const wtrx = String(wdl.json.trx ?? "");
  check("the response quotes the new wallet", await wallet(), wdl.json.wallet);
  check("the wallet really dropped", await wallet() < beforeWithdraw, true);

  const history = await html("/withdraw/history", session.cookie);
  check("withdrawal shows in player history", wtrx !== "" && history.includes(wtrx), true);

  /* ------------------------------------------------------ admin cancels it */
  const wdlPage = await html("/admin/withdrawals", adminHeader);
  check("pending withdrawal appears in the back office", wdlPage.includes(wtrx), true);
  const cancelAction = findActionId(wdlPage, "Cancel");
  if (!cancelAction) throw new Error("no cancel form on /admin/withdrawals — the action is not wired");
  const cancelId = formField(wdlPage, cancelAction, "id");

  const afterReserve = await wallet();
  const cancel = await api("/admin/withdrawals", {
    form: { [cancelAction]: "", id: cancelId, adminNote: "player changed mind" },
    cookie: adminHeader,
  });
  check("cancel redirects", cancel.status, 303);
  check("cancel refunds the reservation", await wallet(), afterReserve + wRowCharge(method));

  const cancelAgain = await api("/admin/withdrawals", {
    form: { [cancelAction]: "", id: cancelId, adminNote: "second click" },
    cookie: adminHeader,
  });
  check("replayed cancel still redirects", cancelAgain.status, 303);
  check("replayed cancel refunds nothing", await wallet(), afterReserve + wRowCharge(method));

  /* ----------------------------------------------------------------- ledger */
  const rows = await prisma.transaction.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
  });
  const total = rows.reduce((a, t) => a + t.amount, 0);
  check("ledger sums to the live wallet", start + total, await wallet());
  check("deposit and refund are both on the ledger", new Set(rows.map((r) => r.type)), new Set(["deposit", "refund"]));

  // Names repeated in the summary so a failure is identifiable without scrolling
  // back through the log — several checks assert live balances, and knowing
  // *which* one is what tells you whether it is a real regression or a blip.
  if (failedLabels.length > 0) console.log(`failed: ${failedLabels.join(" | ")}\n`);
  console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  void CID;
}

/** Coins taken at request time: the payout plus the rail's fee. */
function wRowCharge(method: { percentFee: number; fixedFee: number }): number {
  return 100 + Math.round((100 * method.percentFee) / 100 + method.fixedFee);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());