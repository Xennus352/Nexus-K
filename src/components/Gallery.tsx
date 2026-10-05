"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import GameCard, { GameCardData } from "./GameCard";

export default function Gallery({ games }: { games: GameCardData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cards = el.querySelectorAll(".game-card");
    // The engine is a separate process and can be down, which leaves `games` empty.
    // Handing GSAP an empty NodeList is not a no-op: `stagger` makes it build a
    // nested timeline over the parsed targets, so it warns once for the tween and
    // again for that timeline, and animates nothing.
    if (!cards.length) return;

    // A context so the effect can be re-run or unmounted without a tween left
    // writing `y`/`opacity` onto cards React has already moved on from. It also
    // resets the inline styles the previous run left behind.
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: "power2.out" }
      );
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={ref} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {games.map((g) => (
        <GameCard key={`${g.prov}/${g.name}`} g={g} />
      ))}
    </div>
  );
}
