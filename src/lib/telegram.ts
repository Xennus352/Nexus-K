// Telegram bridge for support and money movement.
//
// Three directions:
//
//   out  — a player opens `https://t.me/<bot>?start=<payload>` straight from the
//          support pages, so the deep link carries the ticket number and the
//          operator knows who is talking without asking.
//   in   — new tickets and operator replies are pushed to the operator's chat.
//   money — deposit and withdrawal alerts, plus the transfer screenshot a player
//          attaches to a manual deposit, fan out to a separate list of chats.
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

  return sendTo(chat, text);
}

async function sendTo(chat: string, text: string): Promise<SendResult> {
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

/* ------------------------------------------------------- money alerts (fan-out) */

/**
 * Chats that receive deposit and withdrawal alerts.
 *
 * Deliberately separate from the support chat: support is a queue with one
 * operator, while money movement is something more than one person has to see —
 * a missed withdrawal alert is a player waiting a day for a payout. The value is
 * a comma-separated list of chat ids so the operator set can change from
 * /admin/settings without a redeploy.
 */
const MONEY_CHATS_SETTING = "money.telegram_chats";

/**
 * Chats the operator named for money alerts, before anyone opens settings.
 *
 * Seeded into the database on first run (see server/seed.ts) so the alerts work
 * out of the box. Read through `setting()`, which prefers the stored row, so
 * deleting the value here does not strand the default — it only affects a
 * database that has never been seeded.
 */
export const DEFAULT_MONEY_CHATS = "5458464856,6629148549"; // keep in step with SETTING_DEFS

/** How many chats one alert fans out to. Guards a fat-fingered paste of 40 ids. */
const MAX_MONEY_CHATS = 8;

/**
 * Reads the configured alert chats.
 *
 * Returns an empty list rather than a default: silently messaging a chat id
 * nobody chose is worse than not messaging at all, and the operator can see an
 * empty field in settings instead of wondering why alerts vanished.
 */
export async function moneyChats(): Promise<string[]> {
  // `?? DEFAULT` rather than `||`: an operator who deliberately clears the field
  // wants no alerts, and blanking a setting has to be able to do that.
  const raw = (await setting(MONEY_CHATS_SETTING)) || DEFAULT_MONEY_CHATS;
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const id = part.trim();
    // Telegram chat ids are numeric, and a supergroup id can be negative.
    if (/^-?\d{1,20}$/.test(id)) seen.add(id);
    if (seen.size >= MAX_MONEY_CHATS) break;
  }
  return [...seen];
}

/**
 * Sends one text to every alert chat.
 *
 * Fan-out is sequential rather than parallel on purpose: the Bot API rate-limits
 * per bot, and two messages fired simultaneously can come back as one 429. These
 * are fire-and-forget alerts, so a few hundred extra milliseconds costs nothing.
 *
 * Returns how many chats accepted it. A failure is never thrown — see header.
 */
export async function notifyMoney(text: string): Promise<number> {
  return fanOut((chat) => sendTo(chat, text));
}

/**
 * Sends a photo to every alert chat, with a caption.
 *
 * Used for the transfer screenshot a player attaches to a deposit: an operator
 * approving money on the strength of an image wants the image in the chat, not a
 * caption pointing at a back-office page they have to be logged into to open.
 *
 * Multipart rather than the JSON base64 form because Telegram's own limit is on
 * the wire size; base64 would inflate a 5 MB screenshot by a third for nothing.
 */
export async function notifyMoneyPhoto(
  body: Buffer,
  filename: string,
  caption: string,
): Promise<number> {
  if (!telegramConfigured()) return 0;
  if (!(await isEnabled())) return 0;

  const chats = await moneyChats();
  if (chats.length === 0) return 0;

  let sent = 0;
  for (const chat of chats) {
    try {
      const form = new FormData();
      form.set("chat_id", chat);
      form.set("caption", caption.slice(0, MAX_TEXT));
      form.set(
        "photo",
        new Blob([new Uint8Array(body)], { type: "image/jpeg" }),
        filename,
      );
      await call("sendPhoto", undefined, form);
      sent++;
    } catch {
      /* one bad chat id must not stop the others */
    }
  }
  return sent;
}

async function fanOut(send: (chat: string) => Promise<SendResult>): Promise<number> {
  if (!telegramConfigured()) return 0;
  if (!(await isEnabled())) return 0;

  const chats = await moneyChats();
  let sent = 0;
  for (const chat of chats) {
    if ((await send(chat)).ok) sent++;
  }
  return sent;
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

/**
 * Minimal Bot API call: returns `result` on success, throws otherwise.
 *
 * `body` may be a `FormData`, in which case fetch sets the multipart boundary
 * itself — passing a hand-built `Content-Type` there would drop the boundary and
 * the API would reject the part with "wrong boundary".
 */
async function call(
  method: string,
  body?: Record<string, unknown>,
  multipart?: FormData,
): Promise<unknown> {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: "POST",
    ...(multipart
      ? { body: multipart }
      : {
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        }),
    // The engine and MongoDB both sit behind networks that hang rather than fail
    // fast, so an unresponsive Telegram must not pin a request open.
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
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