"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up to its new value instead of jumping.
 *
 * A balance that changes from 1,480 to 1,300 in one frame is a number the player
 * has to diff themselves. Tweening it, and colouring it for the direction of
 * travel, turns "did I just win?" into something the screen answers. That
 * question is asked after every single spin, so the answer has to be free of
 * reading effort.
 *
 * The tween is deliberately not a bounce or a flash: `power2.out` over ~450ms
 * reads as one continuous movement. Anything bouncy competes with the reel
 * animation happening next to it.
 */
export default function CountUp({
  value,
  duration = 450,
  className = "",
  format,
}: {
  value: number;
  duration?: number;
  className?: string;
  /** Defaults to thousands-separated. Pass one to change the presentation. */
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  /** Drives the flash; cleared on a timer so it decays even if nothing changes. */
  const [delta, setDelta] = useState<0 | 1 | -1>(0);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    setDelta(value > from ? 1 : -1);
    const flash = setTimeout(() => setDelta(0), 700);

    // Respect a reduced-motion preference: land on the value immediately rather
    // than animating, so the information is never withheld, only the motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = value;
      setShown(value);
      return () => clearTimeout(flash);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // power2.out, written out rather than pulled from a library: this is the one
      // easing in the file and it does not justify the dependency.
      const eased = 1 - (1 - t) * (1 - t);
      setShown(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearTimeout(flash);
      cancelAnimationFrame(rafRef.current);
      // Land exactly on the truth if a new value arrived mid-tween, otherwise the
      // next tween starts from a stale number and visibly jumps.
      fromRef.current = value;
      setShown(value);
    };
  }, [value, duration]);

  const text = format ? format(shown) : Math.round(shown).toLocaleString();
  const tone =
    delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "";

  return (
    <span className={`transition-colors duration-500 ${tone} ${className}`} aria-live="off">
      {text}
    </span>
  );
}