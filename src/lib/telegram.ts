// Telegram bridge for support.
//
// Two directions:
//
//   out  — a player opens `https://t.me/<bot>?start=<payload>` straight from the
//          support pages, so the deep link carries the ticket number and the
//          operator knows who is talking without asking.
//   in   — new tickets and operator replies are pushed to the operator's chat.
//
// Nothing in here may throw. Telegram is a convenience channel, never a
// dependency of the support system: an outage, a bad token or a rate limit has to
// degrade to "the player cannot see the button", not to a 500 on a ticket form.
//
// The bot token is only ever read from the environment. It is a full write
// credential for the bot, so it is never logged, never stored in the database and
// never sent to the browser.

import { setting, settingBool } from "./settings";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = "https://api.telegram.org";

/** Chat id the operator wants notifications in; blank means "not configured". */
const CHAT_SETTING = "support.telegram_chat";
const ENABLED_SETTING = "support.telegram_enabled";

/** Telegram rejects anything longer; tickets and bodies are trimmed to fit. */
const MAX_TEXT = 4096;

/**
 * Budget for one Bot API call.
 *
 * Generous, because the cost of hitting it is uneven: 15s is a long stall on the
 * rare cold path, whereas 6s measured as too tight and timed out while the caller
 * was still finishing a MongoDB round trip — which silently removed the support
 * button for the life of the process.
 */
const CALL_TIMEOUT_MS = 15_000;

export function telegramConfigured(): boolean {
  return TOKEN.length > 0;
}

/* ------------------------------------------------------------------ bot info */

/**
 * Resolves the bot's @username.
 *
 * A token alone is not enough to build a t.me link, and the handle is stable for
 * the life of the bot, so a successful lookup is resolved once per process.
 *
 * A failure is cached, but only for a minute. Caching it for the same six hours
 * as a success is the trap: one slow network moment would answer "no bot" to
 * every page render until the process restarted, and the support button would be
 * gone from the site with nothing in the logs to say why.
 */
const HANDLE_TTL_MS = 6 * 60 * 60 * 1000;
const HANDLE_FAILURE_TTL_MS = 60 * 1000;

let handleCache: { at: number; value: string | null } | null = null;

export async function botHandle(): Promise<string | null> {
  const override = (await setting("support.telegram_handle")).trim();
  if (override) return override.replace(/^@/, "");

  const ttl =
    handleCache && handleCache.value !== null ? HANDLE_TTL_MS : HANDLE_FAILURE_TTL_MS;
  if (handleCache && Date.now() - handleCache.at < ttl) return handleCache.value;

  if (!telegramConfigured()) return null;

  try {
    const me = asRecord(await call("getMe"));
    const username = typeof me?.username === "string" ? me.username : null;
    handleCache = { at: Date.now(), value: username };
    return username;
  } catch {
    handleCache = { at: Date.now(), value: null };
    return null;
  }
}

/**
 * Player-facing deep link, or null when Telegram is unavailable so the caller can
 * hide the button instead of rendering a dead link.
 *
 * `payload` becomes the `/start` parameter, which Telegram hands the bot the next
 * time the player presses start.
 */
export async function supportLink(payload?: string): Promise<string | null> {
  const handle = await botHandle();
  if (!handle) return null;
  const p = (payload ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return p ? `https://t.me/${handle}?start=${p}` : `https://t.me/${handle}`;
}

/* --------------------------------------------------------------------- send */

type SendResult = { ok: boolean; error?: string };

/**
 * Sends one message to the operator chat. Never throws — the caller is usually a
 * server action that has already committed the real work.
 */
export async function sendToOps(text: string): Promise<SendResult> {
  if (!telegramConfigured()) return { ok: false, error: "no bot token" };
  if (!(await isEnabled())) return { ok: false, error: "disabled" };

  const chat = (await setting(CHAT_SETTING)).trim();
  if (!chat) return { ok: false, error: "no operator chat" };

  try {
    await call("sendMessage", {
      chat_id: chat,
      text: text.slice(0, MAX_TEXT),
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/**
 * Pushes a support event to the operator.
 *
 * Fire-and-forget by design: awaited so the message is actually delivered before
 * the action returns, but its result is ignored, so a Telegram failure cannot
 * change what the operator or the player sees in the back office.
 */
export async function notifyOps(text: string): Promise<void> {
  try {
    await sendToOps(text);
  } catch {
    /* see file header */
  }
}

/** Trims a player-supplied body so a pasted wall of text cannot flood the chat. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

/** Something landed in the operators' queue: a brand new ticket. */
export async function notifyNewTicket(t: {
  ticket: string;
  subject: string;
  category: string;
  priority: string;
  email: string;
  body: string;
}): Promise<void> {
  await notifyOps(
    [
      `🎫 New ${t.priority}-priority ticket ${t.ticket}`,
      t.subject,
      `From: ${t.email}`,
      `Category: ${t.category}`,
      "",
      preview(t.body),
    ].join("\n")
  );
}

/** An existing ticket went back into the queue — a player reply or a reopen. */
export async function notifyPlayerReply(t: {
  ticket: string;
  subject: string;
  email: string;
  body: string;
}): Promise<void> {
  await notifyOps(
    ["💬 " + t.email + " replied on " + t.ticket, t.subject, "", preview(t.body)].join("\n")
  );
}

/* -------------------------------------------------------------- chat lookup */

/**
 * Finds the operator's chat id from the bot's pending updates.
 *
 * Getting a bot token from BotFather does not tell us who to notify, and asking
 * the operator to find their own chat id is a well-known support trap. Instead:
 * whoever messages the bot first *is* the operator, so their chat is adopted and
 * stored. The operator runs this once from /admin/settings and never again.
 *
 * Only chats that have actually sent the bot a message are returned — updates
 * that are merely `my_chat_member` joins would pick up whatever group the bot was
 * added to, which is usually not where the notifications should land.
 */
export async function discoverOpsChat(): Promise<{ chatId: string; name: string } | null> {
  if (!telegramConfigured()) return null;
  try {
    const updates = await call("getUpdates", { limit: 100, timeout: 0 });
    const list = Array.isArray(updates) ? updates : [];
    // Oldest first: the operator's first message is the most reliable signal.
    for (const u of list) {
      const chat = asRecord(asRecord(asRecord(u)?.message)?.chat);
      const id = chat?.id;
      if (typeof id !== "number") continue;
      const name =
        [chat?.title, chat?.username, chat?.first_name]
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .join(" ") || `chat ${id}`;
      return { chatId: String(id), name };
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ helpers */

async function isEnabled(): Promise<boolean> {
  try {
    return await settingBool(ENABLED_SETTING, true);
  } catch {
    return false;
  }
}

/** Minimal Bot API call: returns `result` on success, throws otherwise. */
async function call(method: string, body?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The engine and MongoDB both sit behind networks that hang rather than fail
    // fast, so an unresponsive Telegram must not pin a request open.
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: unknown; description?: unknown }
    | null;
  if (!res.ok || !json?.ok) {
    // `json.description` can echo the token back on an auth error; keep it short.
    const desc =
      typeof json?.description === "string" ? json.description.slice(0, 120) : `HTTP ${res.status}`;
    throw new Error(`telegram ${method}: ${desc}`);
  }
  return json.result;
}

/** Narrows an untyped Bot API result to a plain record, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}