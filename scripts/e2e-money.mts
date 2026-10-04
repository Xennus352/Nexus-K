/**
 * End-to-end exercise of the money paths against the running engine.
 *
 * Creates a throwaway player, walks it through a manual deposit (admin
 * approval), a bonus claim, a withdrawal request and an admin cancellation, and
 * asserts the wallet and the ledger agree at each step. Safe to re-run: every
 * run uses a fresh random email.
 *
 *   pnpm db:e2e        (with `pnpm start` and the engine running)
 */
import { prisma } from "@/lib/prisma";
import { engineSignup, engineSigninPlayer, engineWalletAdd, engineWalletGet, CID } from "@/lib/engine";
import { openDeposit, settleDeposit, cancelDeposit, openWithdrawal, payWithdrawal, cancelWithdrawal } from "@/lib/settle";
import { claimBonus, move } from "@/lib/wallet";
import { settingNumber } from "@/lib/settings";
import { paySignupBonuses } from "@/server/signup-bonuses";
import { ref, randomToken } from "@/lib/ids";
import { randomBytes } from "node:crypto";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

/** Asserts `ok: true`, surfacing the module's own error message when it is not. */
function checkOk(label: string, res: { ok: boolean; error?: string }) {
  if (res.ok) check(label, true, true);
  else {
    check(`${label} — ${res.error ?? "no reason given"}`, false, true);
  }
}

/**
 * Whether a settlement flipped the record's status, or null when it errored out.
 * Lets one `check` cover both "it changed" and the idempotent "it did not"
 * replay path without losing the reason a settlement failed.
 */
function changed(res: { ok: boolean; changed?: boolean }): boolean | null {
  return res.ok ? res.changed === true : null;
}

async function walletOf(uid: number | null): Promise<number> {
  if (uid === null) return -1;
  const res = await engineWalletGet(uid);
  return res?.wallet ?? -1;
}

const email = `e2e-${randomBytes(4).toString("hex")}@nexus-k.test`;
const password = randomToken(10);

async function main() {
  console.log(`\n=== e2e: ${email}\n`);

  /* --------------------------------------------------------------- signup */
  const uid = await engineSignup(email, password, "e2e");
  if (uid === null) throw new Error("engine signup failed — is the engine on SLOTOPOL_URL?");
  const auth = await engineSigninPlayer(email, password);
  if (!auth) throw new Error("engine signin failed after signup");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "x",
      engineUid: auth.uid,
      username: "e2e",
      refCode: randomToken(8).toUpperCase(),
    },
  });
  console.log(`player created, engine uid ${auth.uid}`);

  const start = await walletOf(auth.uid);
  check("engine gave a starting balance", start >= 1000, true);
  console.log(`      starting balance: ${start}`);

  /* ------------------------------------------------- admin adjustment (credit) */
  const adj = await move({
    userId: user.id,
    engineUid: auth.uid,
    amount: 1000,
    type: "adjustment",
    memo: "e2e credit",
  });
  checkOk("admin credit succeeds", adj);
  if (adj.ok) check("balance after credit", adj.wallet, start + 1000);

  /* --------------------------------------------------------- manual deposit */
  const gateway = await prisma.gateway.findFirst({ where: { alias: "Manual" } });
  if (!gateway) throw new Error("no Manual gateway — run pnpm db:seed");
  const depTrx = ref("DEP");
  const opened = await openDeposit({
    userId: user.id,
    gateway: {
      id: gateway.id,
      alias: gateway.alias,
      currency: gateway.currency,
      rate: gateway.rate,
      percentFee: gateway.percentFee,
      fixedFee: gateway.fixedFee,
    },
    trx: depTrx,
    amount: 100,
    currency: "USD",
  });
  check("deposit coins computed", opened.coins, 100);
  const depRow = await prisma.deposit.findUnique({ where: { trx: depTrx } });
  check("deposit starts pending", depRow?.status, "pending");

  // Approve twice: the second call must be a no-op, not a second credit.
  const before = await walletOf(auth.uid);
  const s1 = await settleDeposit(depRow!.id);
  const after1 = await walletOf(auth.uid);
  const s2 = await settleDeposit(depRow!.id);
  const after2 = await walletOf(auth.uid);
  check("settleDeposit #1 changed the row", changed(s1), true);
  check("settleDeposit #1 credited coins", after1, before + 100);
  check("settleDeposit #2 is a no-op", changed(s2), false);
  check("settleDeposit #2 did not credit again", after2, after1);

  /* -------------------------------------------------------------- bonuses */
  const daily = await claimBonus({
    userId: user.id,
    engineUid: auth.uid,
    kind: "daily",
    amount: 250,
    memo: "e2e daily",
    period: new Date().toISOString().slice(0, 10),
  });
  check("daily bonus credits", daily.ok, true);
  const dup = await claimBonus({
    userId: user.id,
    engineUid: auth.uid,
    kind: "daily",
    amount: 250,
    memo: "e2e daily replay",
    period: new Date().toISOString().slice(0, 10),
  });
  check("daily bonus is once per day", dup.ok, false);
  const afterBonus = await walletOf(auth.uid);
  check("wallet after bonus", afterBonus, after1 + 250);

  /* ----------------------------------------------------------- withdrawal */
  const method = await prisma.withdrawMethod.findFirst({ where: { code: "bank" } });
  if (!method) throw new Error("no bank withdraw method — run pnpm db:seed");
  const wdlTrx = ref("WDL");
  const wBefore = await walletOf(auth.uid);
  const w = await openWithdrawal({
    userId: user.id,
    method: {
      id: method.id,
      name: method.name,
      code: method.code,
      currency: method.currency,
      rate: method.rate,
      percentFee: method.percentFee,
      fixedFee: method.fixedFee,
    },
    trx: wdlTrx,
    // 400 coins: deposit(100) + credit(1000) + bonus(250) leaves plenty.
    amount: 400,
    currency: "USD",
    details: { accountName: "E2E", accountNumber: "0000", bankName: "Test" },
    accountName: "E2E",
  });
  checkOk("withdrawal opens", w);
  const wRow = await prisma.withdrawal.findUnique({ where: { trx: wdlTrx } });
  check("withdrawal starts pending", wRow?.status, "pending");

  const reserved = await walletOf(auth.uid);
  check("request reserved amount + fee", reserved, afterBonus - wRow!.charge);

  const p1 = await payWithdrawal(wRow!.id);
  const p2 = await payWithdrawal(wRow!.id);
  check("payWithdrawal #1 changed the row", changed(p1), true);
  check("payWithdrawal #2 is a no-op", changed(p2), false);
  check("paying out did not move the wallet again", await walletOf(auth.uid), reserved);

  /* ------------------------------------- second withdrawal, then cancel/refund */
  const wdl2 = ref("WDL");
  const w2 = await openWithdrawal({
    userId: user.id,
    method: {
      id: method.id,
      name: method.name,
      code: method.code,
      currency: method.currency,
      rate: method.rate,
      percentFee: method.percentFee,
      fixedFee: method.fixedFee,
    },
    trx: wdl2,
    amount: 200,
    currency: "USD",
    details: { accountName: "E2E", accountNumber: "0001", bankName: "Test" },
    accountName: "E2E",
  });
  checkOk("second withdrawal opens", w2);
  const wRow2 = await prisma.withdrawal.findUnique({ where: { trx: wdl2 } });
  const beforeCancel = await walletOf(auth.uid);
  const c1 = await cancelWithdrawal(wRow2!.id);
  check("cancelWithdrawal changed the row", changed(c1), true);
  check("cancel refunded the reservation", await walletOf(auth.uid), beforeCancel + wRow2!.charge);
  const c2 = await cancelWithdrawal(wRow2!.id);
  check("cancelWithdrawal #2 is a no-op", changed(c2), false);
  check("no double refund", await walletOf(auth.uid), beforeCancel + wRow2!.charge);

  /* ------------------------------------------------ overdraw is refused */
  const bal = await walletOf(auth.uid);
  const overdraft = await move({
    userId: user.id,
    engineUid: auth.uid,
    amount: -(bal + 1000),
    type: "adjustment",
    memo: "e2e overdraft",
  });
  check("engine refuses an overdraft", overdraft.ok, false);
  check("refused overdraft leaves the wallet alone", await walletOf(auth.uid), bal);

  // A movement past the engine's per-movement cap is rejected, not thrown: it
  // has to come back as an error the caller can render.
  const overLimit = await move({
    userId: user.id,
    engineUid: auth.uid,
    amount: -10_000_000,
    type: "adjustment",
    memo: "e2e over limit",
  });
  check("over-limit movement is refused, not thrown", overLimit.ok, false);
  check("over-limit refusal left the wallet alone", await walletOf(auth.uid), bal);

  // A user with no engine account cannot move coins at all.
  const orphan = await move({
    userId: user.id,
    engineUid: null,
    amount: 500,
    type: "adjustment",
    memo: "e2e orphan",
  });
  check("unlinked account cannot be credited", orphan.ok, false);

  /* ------------------------------------------------- signup bonus fan-out */
  // Welcome bonus plus the referral bonus on both sides, keyed so neither can be
  // claimed twice for one pairing.
  const welcome = await settingNumber("bonus.welcome", 0);
  const referralAmount = await settingNumber("bonus.referral", 0);
  check("a welcome bonus is configured", welcome > 0, true);
  check("a referral bonus is configured", referralAmount > 0, true);

  const friendEmail = `e2e-ref-${randomBytes(4).toString("hex")}@nexus-k.test`;
  const friendPassword = randomToken(10);
  const friendUid = await engineSignup(friendEmail, friendPassword, "e2e-ref");
  if (friendUid === null) throw new Error("engine signup failed for the referred player");
  const friendAuth = await engineSigninPlayer(friendEmail, friendPassword);
  if (!friendAuth) throw new Error("engine signin failed for the referred player");
  const friend = await prisma.user.create({
    data: {
      email: friendEmail,
      passwordHash: "x",
      engineUid: friendAuth.uid,
      username: "e2e-ref",
      refCode: randomToken(8).toUpperCase(),
      refById: user.id,
    },
  });

  const referrerBefore = await walletOf(auth.uid);
  const friendBefore = await walletOf(friendAuth.uid);
  const paid = await paySignupBonuses({
    userId: friend.id,
    engineUid: friendAuth.uid,
    email: friendEmail,
    referrer: { id: user.id, engineUid: auth.uid },
  });
  check("welcome bonus paid", paid.welcome, true);
  check("referral bonus paid to the newcomer", paid.referral, true);
  check("referral bonus paid to the referrer", paid.referrerUnpaid, false);
  check("referrer wallet credited", await walletOf(auth.uid), referrerBefore + referralAmount);
  check("newcomer wallet credited", await walletOf(friendAuth.uid), friendBefore + welcome + referralAmount);

  // Replaying the whole fan-out must not pay anyone twice.
  const replay = await paySignupBonuses({
    userId: friend.id,
    engineUid: friendAuth.uid,
    email: friendEmail,
    referrer: { id: user.id, engineUid: auth.uid },
  });
  check("replayed welcome bonus is refused", replay.welcome, false);
  check("replayed referral is refused on both sides", [replay.referral, replay.referrerUnpaid], [false, true]);
  check("replay credited the referrer nothing", await walletOf(auth.uid), referrerBefore + referralAmount);
  check("replay credited the newcomer nothing", await walletOf(friendAuth.uid), friendBefore + welcome + referralAmount);

  // A player with no referrer is only owed the welcome bonus.
  const solo = await paySignupBonuses({
    userId: friend.id,
    engineUid: friendAuth.uid,
    email: friendEmail,
    referrer: null,
  });
  check("no referrer means no referral bonus", [solo.welcome, solo.referral], [false, false]);

  /* ------------------------------------------------------------- ledger */
  const tx = await prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const kinds = tx.map((t) => t.type);
  check("ledger has the deposit", kinds.includes("deposit"), true);
  check("ledger has the withdrawal", kinds.includes("withdrawal"), true);
  check("ledger has the refund", kinds.includes("refund"), true);
  check("ledger has the bonus", kinds.includes("bonus"), true);
  const last = tx[tx.length - 1];
  check("final ledger row matches the live wallet", last.balance, await walletOf(auth.uid));

  // Every coin in equals every coin out.
  const sum = tx.reduce((a, t) => a + t.amount, 0);
  check("ledger movements reconcile with the balance", sum + start, await walletOf(auth.uid));

  /* -------------------------------------------------------------- totals */
  const user2 = await prisma.user.findUnique({ where: { id: user.id } });
  check("totalDeposit recorded", user2!.totalDeposit, 100);
  check("totalWithdraw recorded", user2!.totalWithdraw > 0, true);

  /* ------------------------------------------------------- deposit cancel */
  const cancelTrx = ref("DEP");
  await openDeposit({
    userId: user.id,
    gateway: { id: gateway.id, alias: gateway.alias, currency: gateway.currency, rate: 1, percentFee: 0, fixedFee: 0 },
    trx: cancelTrx,
    amount: 50,
    currency: "USD",
  });
  const cancelRow = await prisma.deposit.findUnique({ where: { trx: cancelTrx } });
  const beforeCancelDep = await walletOf(auth.uid);
  await cancelDeposit(cancelRow!.id, "e2e");
  check("cancelling a deposit does not move the wallet", await walletOf(auth.uid), beforeCancelDep);

  console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  void CID;
  void engineWalletAdd;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());