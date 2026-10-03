"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function FloatingChips() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.to(ref.current.querySelectorAll(".float-chip"), {
      y: "random(-20, 20)",
      x: "random(-10, 10)",
      rotation: "random(-25, 25)",
      duration: "random(2, 4)",
      repeat: -1,
      yoyo: true,
      stagger: 0.15,
      ease: "sine.inOut",
    });
  }, []);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      {[
        { e: "💎", s: "left-[62%] top-6 text-4xl" },
        { e: "🪙", s: "left-[78%] top-10 text-3xl" },
        { e: "🎰", s: "left-[88%] top-6 text-6xl" },
        { e: "⭐", s: "left-[68%] bottom-6 text-3xl" },
        { e: "🃏", s: "left-[84%] bottom-8 text-4xl" },
      ].map((c, i) => (
        <span key={i} className={`float-chip absolute ${c.s} opacity-70`}>{c.e}</span>
      ))}
    </div>
  );
}
