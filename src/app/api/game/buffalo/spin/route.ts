import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { move, walletOf } from "@/lib/wallet";
import { gameAccess, localGame } from "@/lib/games";
import { siteMaintenance } from "@/lib/maintenance";
import { freeSpinsFor, score, spinOutcome, LINES } from "@/lib/buffalo";

export const runtime = "nodejs";

/**
 * The one authority on African Buffalo spins.
 *
 * Every spin — charged or free — is: the server takes or confirms the bet, picks
 * the grid with `crypto.randomInt`, scores it with the fixed paytable, and pays.
 * The client only ever *displays* this answer. Free spins spend from
 * `BuffaloFeature`, so the promised count lives in a collection the browser
 * cannot write, not in `localStorage` where a refresh would reset it and a
 * request could edit it.
 */
export async function POST(req: NextRequest) {
  const route = "african-buffalo";
  const local = localGame(route)!;

  const maint = await siteMaintenance();
  if (maint.active) {
    return NextResponse.json({ error: "The site is under maintenance." }, { status: 503 });
  }

  const access = await gameAccess(local.key);
  if (access.blocked) {
    return NextResponse.json(
      { error: access.reason === "hidden" ? "That game is no longer available." : "That game is under maintenance." },
      { status: access.reason === "hidden" ? 410 : 503 },
    );
  }

  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
  }
  if (user.engineUid === null) {
    return NextResponse.json({ error: "No game wallet is linked to this account." }, { status: 409 });
  }

  let body: { bet?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const bet = Number(body.bet);
  if (!Number.isFinite(bet) || bet <= 0) {
    return NextResponse.json({ error: "Bet must be more than zero." }, { status: 400 });
  }
  // Whole coins only, and a floor of one per line so a tiny bet cannot score
  // a fractional line stake; the table and the ledger both assume integers.
  const coinsBet = Math.max(LINES.length, Math.round(bet));
  if (coinsBet !== bet) {
    return NextResponse.json({ error: `Bet must be a whole number of coins, at least ${LINES.length}.` }, { status: 400 });
  }

  // Where the round stands before this spin.
  const feature = await prisma.buffaloFeature.findUnique({ where: { userId: user.id } });
  const featureActive = !!feature && feature.spinsLeft > 0;
  const lineStake = coinsBet / LINES.length;

  if (!featureActive) {
    const debit = await move({
      userId: user.id,
      engineUid: user.engineUid,
      amount: -coinsBet,
      type: "bet",
      memo: `African Buffalo bet ${coinsBet}`,
    });
    if (!debit.ok) return NextResponse.json({ error: debit.error }, { status: 400 });
  }

  // The outcome. crypto.randomInt is seeded by the OS and is not spinnable into a
  // weak state the way Math.random's trailing bits are; the grid the player sees
  // is derived from it, never decided by the client.
  const rng = () => randomInt(0, 0x100000000) / 0x100000000;
  const { grid } = spinOutcome(rng);
  const featureMultiplier = featureActive ? feature!.multiplier : 1;
  const outcome = score(grid, lineStake, featureMultiplier);

  // Award, if the screen earned one, and only if nobody already handed this spin
  // its free spins — a round in progress does not start another on top of itself.
  const earned = featureActive ? { spins: 0, multiplier: 1 } : freeSpinsFor(outcome.scatters);
  if (earned.spins > 0) {
    await prisma.buffaloFeature.upsert({
      where: { userId: user.id },
      update: { kind: "free", spinsLeft: earned.spins, multiplier: earned.multiplier },
      create: { userId: user.id, kind: "free", spinsLeft: earned.spins, multiplier: earned.multiplier },
    });
  } else if (featureActive) {
    // This spin was a free one; it is spent.
    const remaining = feature!.spinsLeft - 1;
    if (remaining > 0) {
      await prisma.buffaloFeature.update({
        where: { userId: user.id },
        data: { spinsLeft: remaining },
      });
    } else {
      await prisma.buffaloFeature.delete({ where: { userId: user.id } });
    }
  }

  if (outcome.totalWin > 0) {
    const credit = await move({
      userId: user.id,
      engineUid: user.engineUid,
      amount: outcome.totalWin,
      type: "win",
      memo: `African Buffalo win ${outcome.totalWin}`,
    });
    if (!credit.ok) {
      // The spin resolved, the win did not land. That is a failure the player
      // must hear about, not a quiet loss they should be allowed to think went
      // somewhere else.
      return NextResponse.json(
        { error: "Your win could not be paid right now. Please try again in a moment." },
        { status: 502 },
      );
    }
  }

  // The spin ledger, and the running totals that gate withdrawals — kept as
  // increments rather than recomputed, which is what `logSpin` does for engine games.
  await prisma.spin.create({
    data: { userId: user.id, alias: local.key, bet: featureActive ? 0 : coinsBet, win: outcome.totalWin },
  });
  const realBet = featureActive ? 0 : coinsBet;
  if (realBet > 0 || outcome.totalWin > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalBet: { increment: realBet },
        totalWin: { increment: outcome.totalWin },
      },
    });
  }

  const wallet = await walletOf(user.engineUid).catch(() => null);
  const remaining = earned.spins > 0
    ? earned.spins
    : featureActive
      ? Math.max(0, feature!.spinsLeft - 1)
      : 0;

  return NextResponse.json({
    grid: outcome.grid,
    wins: outcome.wins,
    totalWin: outcome.totalWin,
    multiplier: outcome.multiplier,
    scatters: outcome.scatters,
    feature: featureActive || earned.spins > 0,
    spinsLeftAfter: remaining,
    awarded: earned.spins,
    awardedMultiplier: earned.multiplier,
    wallet,
    bet: featureActive ? 0 : coinsBet,
  });
}

/** What the cabinet needs to know before the first spin of a visit. */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: s.email } });
  if (!user || user.engineUid === null) return NextResponse.json({ feature: null });

  const feature = await prisma.buffaloFeature.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    feature: feature && feature.spinsLeft > 0
      ? { spinsLeft: feature.spinsLeft, multiplier: feature.multiplier }
      : null,
    wallet: await walletOf(user.engineUid).catch(() => null),
  });
}
