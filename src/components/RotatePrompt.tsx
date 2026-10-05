"use client";

import { useEffect, useState } from "react";

/**
 * A gentle nudge to turn the phone sideways.
 *
 * A 5-reel slot cabinet needs width far more than height, so on a portrait phone
 * the cabinet has to shrink the reels to stay fully visible and they end up too
 * small to read. This overlay only appears in that genuinely bad case —
 * a small screen held upright — and is `pointer-events-none` so it never traps a
 * tap or blocks the back button underneath it.
 *
 * It deliberately does not block play: `dvh` already keeps everything on screen,
 * so the reels are usable in portrait, just cramped.
 */
export default function RotatePrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const sync = () => setShow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!show) return null;

  return (
    <div
      // Decorative: the message repeats nothing a player cannot already see.
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-3 sm:hidden"
    >
      <p className="animate-pulse rounded-full border border-sky-400/40 bg-black/80 px-4 py-2 text-center text-xs font-bold text-sky-200 shadow-lg backdrop-blur">
        ⟳ Turn your phone sideways for a bigger cabinet
      </p>
    </div>
  );
}