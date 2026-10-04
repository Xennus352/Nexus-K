"use client";

import { useEffect, useState } from "react";
import CountUp from "@/components/CountUp";
import { subscribeBalance } from "@/server/realtime";

/**
 * The signed-in player's balance, live.
 *
 * `initial` comes from the server render, so the first paint shows a real number
 * rather than a dash. After that it follows updates this tab makes itself and
 * updates other tabs broadcast — which is the case that used to go stale: spin in
 * the game, look at the wallet, find the old figure and wonder which is right.
 *
 * The two inputs are merged by `key`, not by an effect. Remounting on a changed
 * `initial` is the honest way to say "the server has told us something newer than
 * anything this tab could have broadcast", and it avoids the alternative — a
 * reconciliation effect that fights the subscription for ownership of the same
 * state, and whose ordering decides whether the server value or the live value
 * wins. Remounting has no such ambiguity.
 */
export default function BalanceReadout({
  uid,
  initial,
  className = "",
}: {
  uid: number;
  /** Null when the engine could not be read — shown as a dash, not as zero. */
  initial: number | null;
  className?: string;
}) {
  // Distinct per account, so signing in as someone else cannot keep the old
  // subscription's balance on screen.
  return (
    <span className={className}>
      <LiveBalance key={`${uid}:${initial}`} uid={uid} initial={initial} />
    </span>
  );
}

function LiveBalance({ uid, initial }: { uid: number; initial: number | null }) {
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => subscribeBalance(uid, setLive), [uid]);

  // A live figure is newer than the server render by definition, so it wins when
  // both exist.
  const balance = live ?? initial;

  return (
    <>
      {balance === null ? "—" : (
        <>
          💎 <CountUp value={balance} />
        </>
      )}
    </>
  );
}