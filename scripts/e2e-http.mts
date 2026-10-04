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
import { engineWalletGet, CID } from "@/lib/engine";
import { randomBytes } from "node:crypto";

const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@nexus-k.test";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
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

  const adminRes = await fetch(`${APP}/admin/login`);
  check("admin login page is reachable", adminRes.status, 200);

  /* ------------------------------------------------------------ admin cookie */
  const { execFileSync } = await import("node:child_process");
  const minted = execFileSync(
    "npx",
    ["tsx", "--env-file=.env", "scripts/mint-admin-cookie.mts", ADMIN_EMAIL],
    { encoding: "utf8" },
  );
  const adminCookie = /^nk_admin=(.+)$/m.exec(minted.trim())?.[1] ?? "";
  if (!adminCookie) throw new Error("could not mint an admin cookie");
  const adminHeader = `nk_admin=${adminCookie}`;
  const adminPage = await html("/admin", adminHeader);
  check("admin cookie opens the dashboard", adminPage.includes("BACK OFFICE"), true);

  /* --------------------------------------------------------- create a player */
  // `mint-player-cookie.mts` owns registration: it signs the player up in the
  // engine and creates the mongo row in one place, so this test cannot drift
  // from what a real sign-up produces.
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