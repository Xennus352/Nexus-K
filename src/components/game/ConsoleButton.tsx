// Console buttons, drawn entirely in CSS.
//
// The cabinet controls used to be `<img src={buttons.spin}>` plates from the
// original dump, with a scrim over the artwork so the label stayed legible. That
// had three problems worth naming:
//
//   * the plates were a fixed aspect ratio, so every control inherited the same
//     image proportions whether it was the wide spin button or the small −;
//   * there was nothing to animate — hover was `brightness: 110%` on a bitmap, so
//     it read as a flat wash rather than a press;
//   * the art was per-game, so a control looked different on every one of the
//     347 games.
//
// A physical console button is a small stack of layers — a lit top face, a
// brighter bevel, a coloured glow, and a hard shadow that closes on press — and
// all four are cheaper and sharper as CSS than as bitmaps. They scale with the
// control, match the theme, and can actually be pressed.
//
// `cursor: pointer` is set explicitly on every variant. A control that responds
// to hover but shows an arrow cursor reads as broken, and the arrow is the only
// affordance on the ones without a label.

export type ConsoleButtonTone =
  /** Neutral grey. −, +, min, max: adjust the stake, never a commitment. */
  | "neutral"
  /** Amber. Max: a jump, not a gradual increase. */
  | "amber"
  /** Blue. Autoplay: a mode, so it latches visibly. */
  | "blue"
  /** Rose. Stop: the one control that undoes something. */
  | "rose"
  /** Gold. Spin: the only button that spends money. */
  | "gold"
  /** Emerald. Keep: cashing out of the gamble ladder. */
  | "green";

type Face = { from: string; to: string; glow: string; ring: string };

const FACES: Record<ConsoleButtonTone, Face> = {
  neutral: {
    from: "#5b6b9e",
    to: "#2f3c6b",
    glow: "rgba(148,178,255,0.45)",
    ring: "rgba(191,214,255,0.35)",
  },
  amber: {
    from: "#fcd34d",
    to: "#d97706",
    glow: "rgba(251,191,36,0.55)",
    ring: "rgba(253,230,138,0.55)",
  },
  blue: {
    from: "#38bdf8",
    to: "#1d4ed8",
    glow: "rgba(56,189,248,0.55)",
    ring: "rgba(186,230,253,0.55)",
  },
  rose: {
    from: "#fb7185",
    to: "#be123c",
    glow: "rgba(251,113,133,0.55)",
    ring: "rgba(254,205,211,0.55)",
  },
  gold: {
    from: "#fde68a",
    to: "#d97706",
    glow: "rgba(251,191,36,0.75)",
    ring: "rgba(254,243,199,0.7)",
  },
  green: {
    from: "#6ee7b7",
    to: "#047857",
    glow: "rgba(52,211,153,0.55)",
    ring: "rgba(167,243,208,0.55)",
  },
};

export default function ConsoleButton({
  tone = "neutral",
  onClick,
  disabled,
  active,
  title,
  label,
  testId,
  className = "",
  children,
  /** Rendered as a bigger face with a larger resting glow. */
  emphasis = false,
}: {
  tone?: ConsoleButtonTone;
  onClick?: () => void;
  disabled?: boolean;
  /** Latched state, drawn as a lit ring plus a persistent glow. */
  active?: boolean;
  title?: string;
  /** Accessible name. Falls back to the title, then to the visible text. */
  label?: string;
  testId?: string;
  className?: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  const f = FACES[tone];
  // The face is two gradients stacked: a lit top edge, then the body. Keeping it
  // inline (rather than in a utility class) is what lets the same face recolour
  // per theme without generating a class per combination.
  const face = `linear-gradient(180deg, ${f.from} 0%, ${f.to} 52%, ${f.to} 100%)`;
  const name = label ?? title ?? (typeof children === "string" ? children : undefined);

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={name}
      aria-pressed={active}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`nk-btn group relative isolate flex cursor-pointer select-none items-center justify-center overflow-hidden rounded-2xl font-black uppercase tracking-wider text-white transition-[transform,box-shadow,filter] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 ${className}`}
      style={{
        backgroundImage: face,
        // Two shadows: a tight contact shadow that reads as the button's own
        // thickness, and the coloured glow that reads as a backlight. The press
        // shrinks both, which is most of why it feels like a key rather than a
        // rectangle that changes shade.
        boxShadow: active
          ? `inset 0 2px 0 rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.45), 0 0 0 2px ${f.ring}, 0 0 18px ${f.glow}`
          : `inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.35), 0 3px 0 ${shade(f.to, -0.45)}, 0 6px 14px rgba(0,0,0,0.5)${emphasis ? `, 0 0 ${emphasis ? 22 : 0}px ${f.glow}` : ""}`,
        filter: "saturate(1.05)",
        textShadow: "0 1px 2px rgba(0,0,0,0.75)",
      }}
    >
      {/* Specular sweep. Diagonal and off-centre so it reads as light from above
          rather than as a gradient bug, and it is what carries the hover: it
          slides across on hover instead of the whole face brightening. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 transition-transform duration-300 ease-out group-hover:translate-x-1/4"
        style={{
          background:
            "linear-gradient(105deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.10) 32%, transparent 62%)",
        }}
      />
      {/* Inner vignette to seat the label. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 0%, transparent 45%, rgba(0,0,0,0.32) 100%)",
        }}
      />
      <span className="pointer-events-none relative flex items-center justify-center gap-1 leading-none">
        {children}
      </span>
    </button>
  );
}

/**
 * Darkens or lightens a hex colour by `amount` (-1…1).
 *
 * The pressed shadow needs a colour darker than the face, and CSS has no
 * `color-mix` fallback for a computed value in every engine this has to run in.
 */
function shade(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return "rgba(0,0,0,0.6)";
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const ch = [(num >> 16) & 255, (num >> 8) & 255, num & 255].map((c) =>
    clamp(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount),
  );
  return `rgb(${ch[0]} ${ch[1]} ${ch[2]})`;
}