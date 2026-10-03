"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import GameCard, { GameCardData } from "./GameCard";

export default function Gallery({ games }: { games: GameCardData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current.querySelectorAll(".game-card"),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.04, ease: "power2.out" }
    );
  }, []);
  return (
    <div ref={ref} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {games.map((g) => (
        <GameCard key={`${g.prov}/${g.name}`} g={g} />
      ))}
    </div>
  );
}
