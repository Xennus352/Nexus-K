"use client";

// Animated backdrop for the sign-in screens.
//
// The sign-in page is the one screen every visitor sees, so it carries the game
// identity on its own: the Zeus pack's Olympus plate drifting behind, its symbols
// scattered across the whole viewport and wandering in place, and the gptEgypt
// emblems turning in the corners. Everything is CSS-positioned and driven by one
// GSAP context that is torn down on unmount, and the whole thing collapses to a
// static frame under `prefers-reduced-motion`.
//
// Positions are derived from a seeded hash rather than Math.random(): this is a
// client component, but Next still renders it on the server first, and a random
// position per render is a hydration mismatch.
//
// Shared by `/` (players) and `/portal` (staff). The two are the same scene with
// different chrome, so the wording is switched by `variant` rather than by
// rendering two near-identical backdrops that would drift apart.

import { useEffect, useRef } from "react";
import gsap from "gsap";

const ZEUS = "/gfx/zeus";
const EGYPT = "/gfx/egypt";

/** The wide painted scene from the Zeus pack, used as the plate. */
const PLATE = `${ZEUS}/bg/olympus_sunrise.webp`;

/**
 * Slot symbols scattered across the scene.
 *
 * Sixteen, so the viewport is genuinely populated rather than dotted — an earlier
 * pass used eight, all anchored to the bottom edge, which read as one clump
 * drifting past the card instead of a cabinet full of symbols.
 */
const FLOATERS = [
  "zeus_portrait", "trident", "pegasus", "gold_coin",
  "jackpot_crown", "sun_medallion", "storm_orb", "greek_helmet",
  "blue_gem", "red_gem", "purple_gem", "golden_chalice",
  "greek_vase", "golden_lyre", "laurel_wreath", "lightning_scatter",
].map((n) => `${ZEUS}/sym/${n}.webp`);

/** Corner ornaments from the gptEgypt drop. */
const ORNAMENTS = ["goldscarab", "udjat", "khopesh"].map((n) => `${EGYPT}/${n}.webp`);

/**
 * The only thing that differs between the two sign-in screens: which audience the
 * scene is introducing, and therefore what it says underneath.
 *
 * `note` and `crossLink` are optional, and the player variant now omits both. The
 * player screen was carrying three separate pointers away from the thing it is
 * actually for — "Members sign in below", a "Staff portal" link, and the same link
 * again in the form footer — and all three read as noise on a page whose only job is
 * to get someone into the lobby. The staff screen keeps its cross-link, because a
 * back-office operator who lands on `/portal` by mistake still needs a way out.
 */
type SceneCopy = {
  eyebrow: string;
  strapline: string;
  note?: string;
  crossLink?: { href: string; label: string };
};

export type LoginSceneVariant = "player" | "staff";

const COPY: Record<LoginSceneVariant, SceneCopy> = {
  player: {
    eyebrow: "Blue Diamond Casino",
    // Verified against the lobby: 347 games across these 10 providers.
    strapline: "347 slots · 10 providers · provably fair engine",
  },
  staff: {
    eyebrow: "Staff portal",
    strapline: "Back-office access · Nexus-K operations",
    note: "Players sign in on the main site.",
    crossLink: { href: "/", label: "Player sign-in" },
  },
};

/**
 * Small deterministic PRNG so a symbol keeps the same path on every render.
 *
 * The generator is warmed up before use. Consecutive outputs of a bare LCG are
 * strongly correlated, and because the seeds here differ by one character, the
 * first draws were nearly identical — which showed up as several symbols sharing a
 * size and a position. Skipping the first eight values decorrelates them.
 */
function seeded(seed: string): () => number {
  let s = 2166136261;
  for (const c of seed) s = (s ^ c.charCodeAt(0)) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 8; i++) next();
  return next;
}

/**
 * Evenly spread offsets for index `i`, in [0, 1).
 *
 * Low-discrepancy rather than random, on purpose. Jittering a grid with random
 * values does not reliably spread anything: the distribution clumps, and at this
 * count it reliably put two symbols within a percentage point of each other while
 * leaving a cell empty.
 *
 * The two strides are not interchangeable, because a row-major grid does not step
 * the index evenly in both directions. Along a row the index advances by 1, so a
 * plain golden stride is fine. Down a column it advances by 4, and the golden
 * conjugate collapses under that: 4 × 0.7548 mod 1 = 0.0195, so all four symbols
 * in a column landed on almost the same offset and the whole cluster sat in the
 * left of its cell. 0.8125 is chosen so that 4 × it mod 1 = 0.25 — the four rows
 * of a column are then exactly a quarter apart, and each column gets a different
 * rotation of that set, so the grid does not read as a grid.
 */
const JITTER_X = 0.8125;
const JITTER_Y = 0.5698402909980532; // 1/φ², for the ±1 direction

function spread(i: number, stride: number, phase = 0): number {
  return (i * stride + phase) % 1;
}

/**
 * Placement for one floater, as percentages of the viewport.
 *
 * One floater per cell of a 4×4 grid, offset within its cell by the low-discrepancy
 * sequence above. The cell guarantees an even spread — no two symbols can end up in
 * the same neighbourhood, and no quadrant is left bare — while the offset keeps it
 * from looking like a tile pattern.
 */
const GRID_COLS = 4;
const GRID_ROWS = 4;

type Scatter = {
  /** Centre of the symbol's cell, as a percentage from the left/top. */
  left: number;
  top: number;
  size: number;
  opacity: number;
  /** Seed for the motion tween, kept separate from the placement seed. */
  seed: string;
};

function scatter(i: number, src: string): Scatter {
  const col = i % GRID_COLS;
  const row = Math.floor(i / GRID_COLS);
  const cw = 100 / GRID_COLS;
  const ch = 100 / GRID_ROWS;
  // The largest deviation `spread` can produce is half the interval, so an amplitude
  // of 3/4 of a half-cell guarantees a symbol stays inside its own cell while still
  // travelling far enough that the grid is not visible.
  const ampX = (cw / 2) * 0.75;
  const ampY = (ch / 2) * 0.75;
  const offX = (spread(i, JITTER_X) - 0.5) * 2 * ampX;
  const offY = (spread(i, JITTER_Y, 0.5) - 0.5) * 2 * ampY;

  // Size and opacity come from the PRNG rather than the sequence, so they can vary
  // freely without affecting how evenly the symbols are placed.
  const rnd = seeded(`style:${src}:${i}`);

  return {
    left: col * cw + cw / 2 + offX,
    top: row * ch + ch / 2 + offY,
    size: 42 + rnd() * 82,
    // Varied so the scatter has depth: a few read as near, most as far off.
    opacity: 0.16 + rnd() * 0.34,
    seed: `drift:${src}:${i}`,
  };
}

export default function LoginScene({
  children,
  variant = "player",
}: {
  children: React.ReactNode;
  variant?: LoginSceneVariant;
}) {
  const root = useRef<HTMLDivElement>(null);
  const copy = COPY[variant];

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // matchMedia scopes every tween to the reduced-motion preference, so the
    // fallback branch below cannot leave half the animations running.
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Backdrop plate: a slow push-in so the scene never sits still.
      gsap.to(".nk-plate", {
        scale: 1.14,
        xPercent: -3,
        duration: 26,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      // Symbols wander about the screen they were scattered over. Each gets its own
      // amplitude, period and starting phase, so they never sync up into a visible
      // pattern — and because the motion is a yoyo around a fixed anchor rather than
      // a one-way rise, a floater stays in its own region instead of all of them
      // sweeping off the top together and leaving the screen empty.
      gsap.utils.toArray<HTMLElement>(".nk-floater").forEach((node, i) => {
        const rnd = seeded(node.dataset.seed ?? `drift:${i}`);
        // Centring is applied, not animated. Inside the yoyo below these would be
        // tweened from 0, so every symbol would visibly slide in from its own
        // top-left corner over the first half of its cycle.
        gsap.set(node, { xPercent: -50, yPercent: -50 });
        gsap.to(node, {
          x: (rnd() - 0.5) * 150,
          y: (rnd() - 0.5) * 170,
          rotation: (rnd() - 0.5) * 70,
          duration: 15 + rnd() * 19,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          // A negative delay starts the tween part-way through its cycle, which is
          // what stops all sixteen from beginning at the same instant.
          delay: -rnd() * 24,
        });
      });

      // Emblems turn slowly, as if hung and swinging in a draught.
      gsap.utils.toArray<HTMLElement>(".nk-ornament").forEach((node, i) => {
        gsap.to(node, {
          rotate: i % 2 === 0 ? 360 : -360,
          duration: 46 + i * 9,
          ease: "none",
          repeat: -1,
        });
      });

      // Entrance. The title letters stagger in, then the card lifts and fades up
      // under them — the sequence is what makes the page feel built, not loaded.
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".nk-plate", { opacity: 0, scale: 1.3, duration: 1.4, ease: "power2.out" })
        // Symbols materialise with the plate rather than arriving with the page.
        // Opacity only: the drift tweens above already own each symbol's transform,
        // and animating the same property from two timelines would fight.
        .from(
          ".nk-floater",
          { opacity: 0, duration: 1.1, stagger: { each: 0.05, from: "random" }, ease: "power2.out" },
          "-=1.1"
        )
        .from(
          ".nk-letter",
          { yPercent: 120, opacity: 0, rotateX: -80, duration: 0.7, stagger: 0.045 },
          "-=0.7"
        )
        .from(
          ".nk-rule",
          { scaleX: 0, opacity: 0, duration: 0.7, stagger: 0.08 },
          "-=0.35"
        )
        .from(
          ".nk-tagline",
          { y: 14, opacity: 0, duration: 0.6, stagger: 0.09 },
          "-=0.4"
        )
        .from(
          ".nk-panel",
          { y: 34, opacity: 0, scale: 0.965, duration: 0.75, ease: "back.out(1.4)" },
          "-=0.45"
        );
    });

    return () => mm.revert();
  }, []);

  return (
    <div ref={root} className="relative isolate min-h-screen overflow-hidden bg-[#0a1330] text-white">
      {/* painted plate */}
      <div className="pointer-events-none absolute inset-0 -z-30">
        <div
          className="nk-plate h-full w-full scale-110 bg-cover bg-center will-change-transform"
          style={{ backgroundImage: `url(${PLATE})` }}
        />
      </div>

      {/* grade + vignette: keeps the plate from fighting the form for attention */}
      <div
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 8%, rgba(24,42,96,0.30) 0%, rgba(8,14,38,0.78) 62%, rgba(4,8,22,0.94) 100%)",
        }}
      />

      {/* scattered symbols */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {FLOATERS.map((src, i) => {
          const s = scatter(i, src);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              data-seed={s.seed}
              className={`nk-floater absolute select-none will-change-transform ${
                // Sixteen symbols sized for a desktop are far too dense on a phone:
                // at 375px wide each cell is under 100px and they pile onto the
                // card. Below `md` only the outer columns survive — eight symbols
                // that still reach both edges and every row, but leave the middle
                // clear for the form.
                i % 4 === 1 || i % 4 === 2 ? "max-md:hidden" : ""
              }`}
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                // The resting opacity is set inline rather than faded in by GSAP, so
                // the scatter is still there — static — under reduced motion.
                opacity: s.opacity,
                filter: "drop-shadow(0 8px 26px rgba(0,0,0,0.65))",
              }}
            />
          );
        })}
      </div>

      {/* egyptian corner ornaments */}
      {ORNAMENTS.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className="nk-ornament pointer-events-none absolute -z-10 hidden select-none opacity-[0.16] will-change-transform lg:block"
          style={{
            width: 150 + i * 34,
            top: i === 0 ? "7%" : i === 1 ? "auto" : "9%",
            bottom: i === 1 ? "6%" : undefined,
            left: i === 1 ? "4%" : i === 0 ? "3%" : "auto",
            right: i === 2 ? "3%" : undefined,
          }}
        />
      ))}

      {/* content */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-7 px-5 py-14 sm:px-8">
        <header className="text-center">
          {/* Each letter is its own span so GSAP can stagger them; the wrapper
              clips the upward slide so the type appears to rise into view. */}
          <h1 className="flex items-end justify-center overflow-hidden pb-1 font-black leading-none">
            {"NEXUS-K".split("").map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="nk-letter bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-6xl text-transparent drop-shadow-[0_0_28px_rgba(251,191,36,0.45)] sm:text-8xl"
                style={{ perspective: 600 }}
              >
                {ch}
              </span>
            ))}
          </h1>

          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="nk-rule h-px w-16 bg-gradient-to-r from-transparent to-amber-400/70" />
            <p className="nk-tagline text-[11px] font-semibold uppercase tracking-[0.42em] text-amber-200/90">
              {copy.eyebrow}
            </p>
            <span className="nk-rule h-px w-16 bg-gradient-to-l from-transparent to-amber-400/70" />
          </div>

          <p className="nk-tagline mt-3 text-sm text-slate-300/80">{copy.strapline}</p>
        </header>

        <div className="nk-panel w-full">{children}</div>

        {/* Rendered only when there is something to say. The separator is drawn from
            the pieces that exist rather than always, so a variant with just a note
            does not end up with a dangling "·" against nothing. */}
        {(copy.note || copy.crossLink) && (
          <footer className="nk-tagline flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-xs text-slate-400/80">
            {copy.note && <span>{copy.note}</span>}
            {copy.note && copy.crossLink && <span className="text-slate-600">·</span>}
            {copy.crossLink && (
              <a
                href={copy.crossLink.href}
                className="font-semibold uppercase tracking-wider text-sky-300/90 underline-offset-4 transition hover:text-sky-200 hover:underline"
              >
                {copy.crossLink.label}
              </a>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}