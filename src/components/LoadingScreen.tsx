"use client";

// The giveaway boot screen.
//
// It is the first thing a player sees on a cold lobby load, so it has to carry the
// campaign rather than look like a spinner: gold on teal, the banner in relief,
// and a counter that visibly climbs. The number is the whole trick — a bar that
// jumps tells the player nothing about whether the page is alive, and the arc from
// 0 to 100 is what covers the few hundred milliseconds a cold lobby actually takes
// without it feeling like a stall.
//
// Three things here are load-bearing rather than decorative:
//
//   * The screen always takes itself off the page. `onLoadComplete` is optional,
//     but an overlay that has faded to opacity 0 is still a `fixed inset-0`
//     element sitting over the lobby eating every click, so both exit paths end
//     in `null` whether or not anybody is listening.
//   * The run lands on 100% from `onComplete` and `onInterrupt` as well as from
//     the tween's own progress. A tween killed mid-run — Strict Mode's double
//     effect, a re-render, a tab that was backgrounded — must never leave the
//     screen parked at 62%.
//   * Every tween is created inside one `gsap.context` (with the `matchMedia`
//     inside it, which the context takes ownership of) and reverted on cleanup —
//     and that cleanup also runs when the screen takes itself off, so the endless
//     backdrop loops stop instead of ticking against a detached tree. The exit
//     timeline is the one animation a context cannot see, because it is built from
//     inside a tween callback, so it is killed by hand.
//
// The flanking dragons and the seated warrior are placeholders. The art has not
// landed, and an `<img>` pointing at a file that does not exist renders a broken
// image box in the middle of the screen — so each slot is a styled silhouette
// block, and dropping the real file in means replacing one element.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

/** The banner, split so it can stack instead of running off the side of a phone. */
const BANNER = ["GIVEAWAY", "GIVEAWAY"] as const;

/** Where the flanking art goes. Both still empty; see the note above. */
const SLOTS = [
  { key: "dragon", side: "left" },
  { key: "warrior", side: "right" },
] as const;

/**
 * The gold-to-red face of the banner.
 *
 * Gradient-clipped so the fill runs from lit metal at the cap line to cooled
 * ember at the baseline, which is what makes the type read as a solid object
 * rather than as text. The stroke is the outline a carved plaque would have, and
 * the two shadows are the soft layer: a contact shadow to seat the letter on the
 * backdrop and a bloom to lift it off. The bevel itself is *not* here — hard
 * offsets would show through a transparent fill and grey the gold — so it lives
 * on the flat copy behind, one step down.
 */
const RELIEF: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, #fff6d0 0%, #ffd469 26%, #f5a623 52%, #e2560f 74%, #a5140a 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  WebkitTextStroke: "2px rgba(84, 24, 6, 0.9)",
  textShadow: "0 12px 26px rgba(0,0,0,0.62), 0 0 46px rgba(255,190,80,0.45)",
};

/**
 * The band around the progress track.
 *
 * Lit along the top edge and dark along the bottom, so it reads as a bevelled
 * metal ring rather than a flat gold outline — the frame is doing most of the work
 * of making a 16px bar look built rather than drawn.
 */
const METAL: React.CSSProperties = {
  background:
    "linear-gradient(180deg, #fff6cf 0%, #f4bd34 30%, #b06a15 58%, #7d3f0a 78%, #ffeeb4 100%)",
  boxShadow:
    "0 0 0 1px rgba(70,36,6,0.85), 0 18px 38px rgba(0,0,0,0.62), 0 0 46px rgba(255,178,60,0.26), inset 0 1px 0 rgba(255,255,255,0.95)",
};

/** The empty track. Nearly black, with the same top-lit convention as the frame. */
const TRACK: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(6,18,22,0.96), rgba(2,8,11,0.98))",
  boxShadow: "inset 0 2px 7px rgba(0,0,0,0.9), inset 0 -1px 0 rgba(255,214,138,0.16)",
};

/** The fill: molten, and hot enough to throw light onto the track around it. */
const MOLTEN: React.CSSProperties = {
  background: "linear-gradient(180deg, #fff7d6 0%, #ffc53d 22%, #ff8a1f 58%, #e8380b 100%)",
  boxShadow:
    "0 0 18px rgba(255,150,40,0.9), 0 0 44px rgba(255,110,20,0.5), inset 0 1px 0 rgba(255,255,255,0.75)",
};

export default function LoadingScreen({
  onLoadComplete,
  duration = 2600,
}: {
  /** Called once, after the fade-out has finished. Optional; see the note above. */
  onLoadComplete?: () => void;
  /** Length of the 0 → 100 run in **milliseconds**. Floored at one second, so a bad
   *  value cannot collapse the run into an instant flash. */
  duration?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  /** Set once the exit has played out; the component then renders nothing. */
  const [gone, setGone] = useState(false);

  /** Still mounted. Gates every write to state or to the DOM below. */
  const liveRef = useRef(true);
  /** The exit has been handed over, so the callback can only fire once. */
  const firedRef = useRef(false);
  /**
   * A proxy object rather than the bar itself, so the readout can show whole
   * percents while the bar keeps the tween's exact fractional width.
   */
  const counterRef = useRef({ v: 0 });

  /**
   * The exit timeline, held by hand.
   *
   * It is built from inside a tween callback, and a `gsap.context` only records
   * the animations that exist while its own function is running — so `revert()`
   * cannot see this one. Without the handle, unmounting the screen mid-fade would
   * leave the timeline running against a detached node for the rest of its 850ms.
   */
  const exitRef = useRef<ReturnType<typeof gsap.timeline> | null>(null);

  /**
   * The callback is read through a ref so that a parent passing an inline arrow
   * cannot re-run the effect and restart the load on every one of its renders.
   */
  const doneRef = useRef(onLoadComplete);
  useEffect(() => {
    doneRef.current = onLoadComplete;
  }, [onLoadComplete]);

  // Layout effect, not effect: the entrance tweens are `from` tweens, and running
  // them after the first paint would show one fully drawn frame of the screen
  // before it animates in.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const barEl = barRef.current;
    // Rendered together, so this is a types guard and not a real branch. Returning
    // early with no exit path would leave an overlay on the page forever.
    if (!el || !barEl) return;

    liveRef.current = true;
    firedRef.current = false;
    counterRef.current.v = 0;
    // The node is reused if the effect runs twice (Strict Mode), and `gsap.set`
    // below writes width as an inline style that `w-0` cannot outrank. Clearing
    // it here is what stops the second run opening at 62%.
    gsap.set(barEl, { width: 0 });

    const ctx = gsap.context(() => {
      /** Pins the screen on its final frame, however the run ended. */
      const land = () => {
        if (!liveRef.current) return;
        counterRef.current.v = 100;
        gsap.set(barEl, { width: "100%" });
        setPct(100);
      };

      /** Hands over once: tells the caller, then lifts the overlay off the page. */
      const dismiss = (animated: boolean) => {
        // The live check comes first because the exit is reachable from
        // `onInterrupt`, and a tween killed by the revert below must not be
        // allowed to queue a fresh exit tween on a component that is already gone.
        if (!liveRef.current || firedRef.current) return;
        firedRef.current = true;

        if (!animated) {
          doneRef.current?.();
          setGone(true);
          return;
        }

        exitRef.current = gsap
          .timeline({
            // Last, so the fade is on screen for its full length before the page
            // underneath becomes the thing you can see.
            onComplete: () => {
              doneRef.current?.();
              // Unconditional, even with no callback: a transparent overlay is
              // still an overlay, and this is the only thing that takes it off.
              if (liveRef.current) setGone(true);
            },
          })
          .to(el, { opacity: 0, duration: 0.85, ease: "power2.inOut" })
          // The stage scales up, not the root: the root is viewport-sized, so
          // scaling it would push its box past the edges of the screen and flick a
          // scrollbar on the way out.
          .to(".nk-ls-stage", { scale: 1.12, y: -22, duration: 0.85, ease: "power2.inOut" }, 0);
      };

      // Created inside the context, which claims it — so `ctx.revert()` below
      // takes down both the motion branch and the still branch with one call.
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Backdrop drift. Each layer moves on its own period and in its own
        // direction, so the scene never pulses as one object.
        gsap.to(".nk-ls-rays", {
          rotate: 360,
          duration: 90,
          repeat: -1,
          ease: "none",
          // Pivots on the hub, not on the middle of the layer. The rays are drawn
          // from 50% 44% (above centre, as light through cloud falls), so a 50% 50%
          // pivot would swing the sun around the screen instead of turning it.
          transformOrigin: "50% 44%",
        });
        gsap.to(".nk-ls-cloud-a", { xPercent: 5, duration: 21, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".nk-ls-cloud-b", { xPercent: -4, duration: 27, repeat: -1, yoyo: true, ease: "sine.inOut" });
        // Specular sweep down the fill. A diagonal band travelling faster than the
        // bar grows is what reads as molten metal rather than as a yellow rectangle.
        gsap.fromTo(
          ".nk-ls-bar > span",
          { xPercent: -60 },
          { xPercent: 460, duration: 1.15, repeat: -1, ease: "none" },
        );

        // Entrance in reading order: banner, then the number, then the thing the
        // number measures. The frame scales in on x only, so it unrolls from the
        // centre the way a bar would rather than growing in every direction.
        gsap.from(".nk-ls-title", { opacity: 0, y: 30, scale: 0.9, duration: 0.95, ease: "power3.out" });
        gsap.from(".nk-ls-pct", { opacity: 0, y: 16, duration: 0.7, delay: 0.3, ease: "power2.out" });
        gsap.from(".nk-ls-frame", { opacity: 0, y: 18, scaleX: 0.82, duration: 0.8, delay: 0.45, ease: "power3.out" });

        // Reached by both endings: a clean run to 100, and a run cut short by a
        // kill. Either way the screen lands on 100 and leaves — one parked at 62%
        // for ever is worse than one that finished a beat early.
        const finish = () => {
          land();
          dismiss(true);
        };

        gsap.to(counterRef.current, {
          v: 100,
          // The prop is milliseconds; GSAP is seconds. Handing it `duration`
          // straight looks right and is not: a 2400ms request becomes a forty-minute
          // run, the counter sits at 0 for the whole session and the overlay never
          // leaves — a boot screen that silently bricks the page behind it. The
          // floor is the one second the original guard meant, which only makes
          // sense once the unit is seconds too.
          duration: Math.max(1000, duration) / 1000,
          // Flat through the middle, quicker off the line and quicker into the
          // gate. A linear ramp reads as a real measurement; a fast-out ramp
          // reads as a fake one that is about to jump.
          ease: "power1.inOut",
          onUpdate: () => {
            if (!liveRef.current) return;
            const v = counterRef.current.v;
            // Written here rather than bound to `pct`, so the bar tracks the exact
            // fractional value while the readout shows whole percents.
            gsap.set(barEl, { width: `${v}%` });
            // Rounded for display only. Unrounded, the run ends one frame at
            // 99.99…%, and a loading screen that says 99 has failed at its one job.
            setPct(Math.round(v));
          },
          onInterrupt: finish,
          onComplete: finish,
        });
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        // Nothing moves and nothing counts, but the run still finishes. Only the
        // motion is optional here; the number and the dismissal are not.
        land();
        dismiss(false);
      });
    }, el);

    return () => {
      // Cleared before the revert, so a tween killed by that revert cannot land on
      // a tree that is on its way out and set state after unmount.
      liveRef.current = false;
      ctx.revert();
      // Killed after it, and explicitly: the exit is not in the context's hands.
      exitRef.current?.kill();
      exitRef.current = null;
    };
  // `gone` is in the deps on purpose. When the screen takes itself off, React
    // removes the nodes but leaves the effect in place, so the four `repeat: -1`
    // backdrop tweens would otherwise keep ticking against a detached tree for
    // the rest of the session. Re-running the effect here finds no root (the refs
    // were detached along with the nodes) and starts nothing.
  }, [duration, gone]);

  // The overlay is gone and so is the DOM that would be blocking the lobby.
  if (gone) return null;

  return (
    <div
      ref={rootRef}
      // z-50 over the app shell: nothing behind this should be reachable until
      // the run finishes, which is also why it has to remove itself.
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#04141a] text-center text-amber-50"
    >
      {/* Backdrop, in layers rather than as one gradient: the teal depth, the gold
          bloom, the two cloud banks and the rays each move on their own period,
          and a single background-image cannot drift. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(78% 62% at 50% 40%, #0d4a4e 0%, #062a31 46%, #031319 100%)",
        }}
      />
      <div
        aria-hidden
        className="nk-ls-rays pointer-events-none absolute inset-0 -z-10 opacity-70 will-change-transform"
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 44%, rgba(255,216,142,0.16) 0deg 3deg, rgba(255,216,142,0) 3deg 14deg)",
          // Faded out towards the corners: hard rays to the edge of the viewport
          // read as a sunburst bug rather than as light through cloud.
          WebkitMaskImage: "radial-gradient(48% 48% at 50% 44%, #000 0%, transparent 76%)",
          maskImage: "radial-gradient(48% 48% at 50% 44%, #000 0%, transparent 76%)",
        }}
      />
      <div
        aria-hidden
        className="nk-ls-cloud-a pointer-events-none absolute inset-x-0 top-0 -z-10 h-[62%] will-change-transform"
        style={{
          background:
            "radial-gradient(58% 50% at 30% 42%, rgba(255,214,138,0.30), transparent 70%), radial-gradient(48% 44% at 74% 64%, rgba(94,234,212,0.16), transparent 72%)",
          filter: "blur(34px)",
        }}
      />
      <div
        aria-hidden
        className="nk-ls-cloud-b pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[58%] will-change-transform"
        style={{
          background:
            "radial-gradient(56% 52% at 70% 44%, rgba(255,170,80,0.22), transparent 72%), radial-gradient(44% 40% at 24% 66%, rgba(45,212,191,0.14), transparent 74%)",
          filter: "blur(42px)",
        }}
      />
      {/* Vignette last, so the eye is pushed to the middle where the count is. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: "radial-gradient(120% 92% at 50% 46%, rgba(0,0,0,0) 38%, rgba(1,9,13,0.88) 100%)",
        }}
      />

      {/* Flanking art slots. Below `lg` they would squeeze the banner on a phone,
          so they only appear where there is room for them. */}
      {SLOTS.map((slot) => (
        <div
          key={slot.key}
          aria-hidden
          data-slot={slot.key}
          className={`pointer-events-none absolute bottom-[5%] -z-10 hidden w-[34%] max-w-[400px] lg:block ${
            slot.side === "left" ? "left-[1%]" : "right-[1%]"
          }`}
        >
          <div className="relative aspect-[3/4] w-full">
            {/* Silhouette placeholder: enough of a shape to show where the art
                goes, none of it detailed enough to be mistaken for the real thing. */}
            <div
              className="absolute inset-0 rounded-[2rem] border border-dashed border-amber-200/15"
              style={{
                background:
                  "radial-gradient(58% 52% at 50% 32%, rgba(255,206,120,0.16), transparent 70%), linear-gradient(180deg, rgba(20,84,88,0.34), rgba(4,18,24,0.5))",
              }}
            />
            <div className="absolute inset-[16%] rounded-full border border-amber-200/10" />
            <div className="absolute inset-x-[28%] bottom-[8%] h-[38%] rounded-t-[45%] bg-amber-100/[0.05]" />
          </div>
        </div>
      ))}

      <div className="nk-ls-stage relative flex w-full max-w-5xl flex-col items-center px-5 will-change-transform">
        <h1 className="nk-ls-title relative select-none font-cinzel text-5xl font-black uppercase leading-[0.95] tracking-[0.01em] sm:text-7xl xl:text-8xl">
          {BANNER.map((word, i) => (
            // `relative` on the row is what anchors each flat copy to its own word
            // rather than to the top of the whole heading.
            <span key={`${word}-${i}`} className="relative block">
              {/* The bevel: the same word one step down in flat ember red, with the
                  hard offsets that a transparent gradient fill cannot show through
                  itself. aria-hidden so the banner is still read exactly once. */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 block translate-y-[7px] text-[#6d1a06]"
                style={{ textShadow: "0 4px 0 rgba(58,16,4,0.9), 0 10px 18px rgba(0,0,0,0.75)" }}
              >
                {word}
              </span>
              <span className="relative block" style={RELIEF}>
                {word}
              </span>
            </span>
          ))}
        </h1>

        <p className="nk-ls-pct mt-7 flex items-baseline justify-center gap-2 font-mono font-bold">
          {/* tabular-nums because the count changes every frame: without it the
              digits have different widths and the readout re-centres itself. */}
          <span className="tabular-nums bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-5xl text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-6xl">
            {pct}
          </span>
          <span className="text-xs tracking-[0.34em] text-amber-200/85">% COMPLETE</span>
        </p>

        <div
          className="nk-ls-frame mt-5 w-[min(560px,84vw)] rounded-full p-[3px] will-change-transform"
          style={METAL}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}% complete`}
          aria-label="Loading the giveaway lobby"
        >
          <div className="relative h-4 w-full overflow-hidden rounded-full" style={TRACK}>
            <div ref={barRef} className="nk-ls-bar relative h-full w-0 overflow-hidden rounded-full" style={MOLTEN}>
              {/* Specular sweep, clipped to the fill. Fades with the bar rather
                  than sitting over the empty track. */}
              <span className="absolute inset-y-0 left-0 w-1/4 -skew-x-[18deg] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-5 font-mono text-[11px] tracking-[0.3em] text-amber-200/55">
        (V1.0.113)
      </p>
    </div>
  );
}