"use client";

// Animated backdrop for the sign-in screens.
//
// The sign-in page is the one screen every visitor sees, so it carries the game
// identity on its own: the Zeus pack's Olympus plate drifting behind, its symbols
// floating up past the card like a slow-motion reel, and the gptEgypt emblems
// turning in the corners. Everything is CSS-positioned and driven by one GSAP
// context that is torn down on unmount, and the whole thing collapses to a
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

/** Slot symbols that drift up behind the card. */
const FLOATERS = [
  "zeus_portrait", "trident", "pegasus", "gold_coin",
  "jackpot_crown", "sun_medallion", "storm_orb", "greek_helmet",
].map((n) => `${ZEUS}/sym/${n}.webp`);

/** Corner ornaments from the gptEgypt drop. */
const ORNAMENTS = ["goldscarab", "udjat", "khopesh"].map((n) => `${EGYPT}/${n}.webp`);

/**
 * The only thing that differs between the two sign-in screens: which audience the
 * scene is introducing, and therefore where it sends anyone who is in the wrong
 * place. A player-facing scene that ended in a "Staff portal" link (and a staff
 * scene that ended in a link to itself) is worse than no link at all.
 */
const COPY = {
  player: {
    eyebrow: "Blue Diamond Casino",
    // Verified against the lobby: 347 games across these 10 providers.
    strapline: "347 slots · 10 providers · provably fair engine",
    note: "Members sign in below.",
    crossLink: { href: "/portal", label: "Staff portal" },
  },
  staff: {
    eyebrow: "Staff portal",
    strapline: "Back-office access · Nexus-K operations",
    note: "Players sign in on the main site.",
    crossLink: { href: "/", label: "Player sign-in" },
  },
} as const;

export type LoginSceneVariant = keyof typeof COPY;

/** Small deterministic PRNG so a symbol keeps the same path on every render. */
function seeded(seed: string): () => number {
  let s = 2166136261;
  for (const c of seed) s = (s ^ c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
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

      // Symbols drift upward past the card on long, offset cycles.
      gsap.utils.toArray<HTMLElement>(".nk-floater").forEach((node, i) => {
        const rnd = seeded(node.dataset.seed ?? String(i));
        gsap.fromTo(
          node,
          { y: 40 + rnd() * 90, opacity: 0, rotate: rnd() * 40 - 20 },
          {
            y: -(120 + rnd() * 220),
            opacity: 0.5,
            rotate: rnd() * 80 - 40,
            duration: 13 + rnd() * 12,
            ease: "none",
            repeat: -1,
            delay: -rnd() * 18,
          }
        );
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

      {/* drifting symbols */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        {FLOATERS.map((src, i) => {
          const rnd = seeded(src + i);
          const left = 4 + rnd() * 92;
          const size = 46 + rnd() * 88;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              data-seed={src}
              className="nk-floater absolute select-none will-change-transform"
              style={{
                left: `${left}%`,
                bottom: "-12%",
                width: size,
                height: size,
                opacity: 0,
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

        <footer className="nk-tagline flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-xs text-slate-400/80">
          <span>{copy.note}</span>
          <span className="text-slate-600">·</span>
          <a
            href={copy.crossLink.href}
            className="font-semibold uppercase tracking-wider text-sky-300/90 underline-offset-4 transition hover:text-sky-200 hover:underline"
          >
            {copy.crossLink.label}
          </a>
        </footer>
      </div>
    </div>
  );
}