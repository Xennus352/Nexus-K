// Slip limits and content sniffing, with no filesystem or Node imports.
//
// Split from server/slips.ts so the client bundle can import the same limits the
// server enforces. Keeping one copy matters: if the browser said 5 MB and the
// server said 10 MB the player would only find out after a slow upload, and if
// they disagreed the other way the form would reject files that were fine.

/** Whitelisted image types. Anything else is refused without being written. */
export const SLIP_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type SlipMime = (typeof SLIP_MIME_TYPES)[number];

/**
 * Telegram accepts up to 10 MB on `sendPhoto`, and a phone screenshot is a
 * couple of hundred KB. 5 MB is generous for a photograph of a receipt and small
 * enough that a player cannot use this as free hosting.
 */
export const MAX_SLIP_BYTES = 5 * 1024 * 1024;

/** Smallest plausible screenshot. Below this it is not an image an operator can use. */
export const MIN_SLIP_BYTES = 64;

/** Display form of MAX_SLIP_BYTES for the form hint. */
export const MAX_SLIP_MB = Math.floor(MAX_SLIP_BYTES / 1024 / 1024);

export function isSlipMime(value: string): value is SlipMime {
  return (SLIP_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Magic-byte signatures.
 *
 * `File.type` is deliberately not consulted: it is a client-supplied string, and
 * accepting it would mean a `.html` renamed to `.png` (or served with
 * `text/html`) passes validation and gets stored. The first bytes are the only
 * evidence that cannot be forged by accident.
 */
export const SLIP_SIGNATURES: { kind: string; mime: SlipMime; test: (b: Uint8Array) => boolean }[] = [
  {
    kind: "png",
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    kind: "jpeg",
    mime: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // "RIFF" .... "WEBP"
    kind: "webp",
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      latin1(b, 0, 4) === "RIFF" &&
      latin1(b, 8, 4) === "WEBP",
  },
  {
    kind: "gif",
    mime: "image/gif",
    test: (b) =>
      b.length >= 6 && (latin1(b, 0, 6) === "GIF87a" || latin1(b, 0, 6) === "GIF89a"),
  },
];

/** Recognises a supported image from its first bytes, or null. */
export function sniffSlip(bytes: Uint8Array): { kind: string; mime: SlipMime } | null {
  return SLIP_SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

function latin1(b: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) out += String.fromCharCode(b[i]);
  return out;
}

/**
 * The shape of a filename this app issued: `<base36 timestamp>-<32 hex>.<ext>`.
 *
 * Checked before any stored name reaches the filesystem, so a hand-edited Deposit
 * row cannot be used to read `../../etc/passwd` or anything outside the upload
 * directory. The extension is constrained to the four we write, which also keeps
 * a stored file from being served with an unexpected content type.
 */
export const STORED_SLIP_NAME = /^[0-9a-z]+-[0-9a-f]{32}\.(png|jpeg|webp|gif)$/;