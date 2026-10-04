// Storage for the transfer screenshots players attach to manual deposits.
//
// A slip is a photograph of someone's bank or e-wallet statement: it carries
// their name, their balance and their transaction history. That makes it far
// more sensitive than the rest of a deposit row, so two rules are absolute here.
//
//   1. Files live in `var/uploads`, never in `public/`. Anything under `public/`
//      is served by Next with no authentication at all, which would turn every
//      slip into a guessable URL on the open internet. The only way to read one
//      is `GET /api/admin/slip/[trx]`, which requires a back-office session.
//   2. The stored name is generated here, never derived from the upload. A
//      client-supplied `../../etc/passwd` or `slip.png.html` must not reach the
//      filesystem, and two players uploading `screenshot.png` must not collide.
//
// The limits and the magic-byte table live in lib/slips.ts so the browser can
// enforce exactly the same rules before it uploads anything.

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  MAX_SLIP_BYTES,
  MIN_SLIP_BYTES,
  STORED_SLIP_NAME,
  sniffSlip,
  type SlipMime,
} from "@/lib/slips";

export { MAX_SLIP_BYTES, MAX_SLIP_MB, MIN_SLIP_BYTES } from "@/lib/slips";

/** Root for uploaded player files. Outside `public/`, and git-ignored. */
export const UPLOAD_DIR = path.join(process.cwd(), "var", "uploads");

export type SavedSlip = {
  /** Generated filename, relative to UPLOAD_DIR. This is what goes in the DB. */
  stored: string;
  /** Original client filename, trimmed and stripped of control characters. */
  originalName: string;
  /** Sniffed content type — never the one the browser claimed. */
  mime: SlipMime;
  bytes: number;
};

export type SlipRejection = { error: string };

/**
 * Validates and writes one upload.
 *
 * Returns either the saved descriptor or a reason. Never throws for bad input:
 * the caller turns a rejection into a 400 with a message the player can act on.
 */
export async function saveSlip(file: File): Promise<SavedSlip | SlipRejection> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size < MIN_SLIP_BYTES) return { error: "That file is too small to be a screenshot." };
  if (file.size > MAX_SLIP_BYTES) {
    return { error: `Screenshot must be under ${Math.floor(MAX_SLIP_BYTES / 1024 / 1024)} MB.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const match = sniffSlip(bytes);
  if (!match) {
    return { error: "That file is not a PNG, JPEG, WebP or GIF image." };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  // 16 random bytes: no collision, and no relationship to the original name.
  const stored = `${Date.now().toString(36)}-${randomBytes(16).toString("hex")}.${match.kind}`;
  await writeFile(path.join(UPLOAD_DIR, stored), bytes, { flag: "wx" });

  return {
    stored,
    // Only ever shown back to an operator, so keep it short and printable.
    originalName: file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "screenshot",
    mime: match.mime,
    bytes: bytes.length,
  };
}

export function isRejection(r: SavedSlip | SlipRejection): r is SlipRejection {
  return "error" in r;
}

/**
 * Absolute path of a stored slip, or null when the name is not one we issued.
 *
 * The stored name is attacker-influenced only in the sense that someone with
 * database access could edit a Deposit row, so the shape is checked anyway: a
 * real name is `<base36>-<32 hex>.<ext>`. Anything else — `..`, an absolute
 * path, a nested directory — is refused rather than resolved.
 */
export function slipPath(stored: string | null | undefined): string | null {
  if (!stored || !STORED_SLIP_NAME.test(stored)) return null;
  return path.join(UPLOAD_DIR, stored);
}

export async function readSlip(stored: string): Promise<Buffer | null> {
  const abs = slipPath(stored);
  if (!abs) return null;
  try {
    return await readFile(abs);
  } catch {
    return null;
  }
}

/** Best-effort removal. A missing file is success, not an error. */
export async function deleteSlip(stored: string | null | undefined): Promise<void> {
  const abs = slipPath(stored);
  if (!abs) return;
  await unlink(abs).catch(() => {});
}