"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function Loader({ label = "SHUFFLING THE REELS…" }: { label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chips = ref.current.querySelectorAll(".ld-chip");
    gsap.to(chips, {
      y: -18, rotationY: 360, duration: 0.7, stagger: 0.12, repeat: -1, yoyo: true, ease: "power1.inOut",
    });
    gsap.fromTo(ref.current.querySelector(".ld-txt"), { opacity: 0.3 }, { opacity: 1, duration: 0.7, repeat: -1, yoyo: true });
  }, []);
  return (
    <div ref={ref} className="flex flex-col items-center gap-5 py-16">
      <div className="flex gap-4">
        {["🎰", "💎", "🔔"].map((c) => (
          <span key={c} className="ld-chip text-5xl drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]">{c}</span>
        ))}
      </div>
      <p className="ld-txt font-mono text-sm tracking-[0.4em] text-sky-300">{label}</p>
    </div>
  );
}
