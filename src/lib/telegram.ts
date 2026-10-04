// Telegram bridge for money movement.
//
// One direction: deposit and withdrawal alerts, plus the transfer screenshot a
// player attaches to a manual deposit, fan out to a configured list of chats.
//
// Nothing in here may throw. Telegram is a convenience channel, never a
// dependency of the deposit or withdrawal path: an outage, a bad token or a rate
// limit has to degrade to "the operator was not told", not to a failed payout or
// a 500 on a form the player already filled in.
//
// The bot token is only ever read from the environment. It is a full write
// credential for the bot, so it is never logged, never stored in the database and
// never sent to the browser.

import { saveSettings, setting, settingBool } from "./settings";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = "https://api.telegram.org";

/** Telegram rejects anything longer; bodies are trimmed to fit. */
const MAX_TEXT = 4096;

/**
 * Budget for one Bot API call.
 *
 * Generous, because the cost of hitting it is uneven: 15s is a long stall on the
 * rare cold path, whereas 6s measured as too tight and timed out while the caller
 * was still finishing a MongoDB round trip.
 */
const CALL_TIMEOUT_MS = 15_000;

export function telegramConfigured(): boolean {
  return TOKEN.length > 0;
}

/* ------------------------------------------------------------------ bot info */

/**
 * Resolves the bot's @username, for /admin/settings to show.
 *
 * Purely diagnostic — it answers "which bot am I actually talking to", which is
 * the first question when alerts do not arrive. The handle is stable for the life
 * of the bot, so a successful lookup is resolved once per process.
 *
 * A failure is cached, but only for a minute. Caching it for the same six hours
 * as a success is the trap: one slow network moment would answer "no bot" to
 * every render until the process restarted, and the settings page would claim the
 * bot was missing while it was only unreachable.
 */
const HANDLE_TTL_MS = 6 * 60 * 60 * 1000;
const HANDLE_FAILURE_TTL_MS = 60 * 1000;

let handleCache: { at: number; value: string | null } | null = null;

export async function botHandle(): Promise<string | null> {
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

/* ------------------------------------------------------- money alerts (fan-out) */

/**
 * Chats that receive deposit and withdrawal alerts.
 *
 * A comma-separated list, so the operator set can change from /admin/settings
 * without a redeploy. This used to be a second chat alongside a support queue:
 * money movement is something more than one person has to see, because a missed
 * withdrawal alert is a player waiting a day for a payout.
 */
const MONEY_CHATS_SETTING = "money.telegram_chats";
const MONEY_ENABLED_SETTING = "money.telegram_enabled";

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

type SendResult = { ok: boolean; error?: string };

/**
 * Sends one text to one chat. Never throws: the caller is usually a server action
 * that has already committed the real work.
 */
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

/* -------------------------------------------------------------- chat lookup */

/**
 * Finds the operator's chat id from the bot's pending updates.
 *
 * Getting a bot token from BotFather does not tell us who to notify, and asking
 * the operator to find their own chat id is a well-known trap. Instead: whoever
 * messages the bot first *is* the operator, so their chat is adopted and stored.
 * The operator runs this once from /admin/settings and never again.
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

/**
 * Adds a chat to the money-alert list without dropping the ones already there.
 *
 * Discovery is additive on purpose. The seeded default pair is what the alerts
 * were built and tested against; a "detect from bot" button that *replaced* the
 * list would quietly stop alerting the second person the moment anyone used it.
 */
export async function addMoneyChat(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!/^-?\d{1,20}$/.test(id)) return;
  const current = await moneyChats();
  if (current.includes(id)) return;
  const next = [...current, id].slice(0, MAX_MONEY_CHATS);
  await saveSettings({ [MONEY_CHATS_SETTING]: next.join(",") });
}

/* ------------------------------------------------------------------ helpers */

/**
 * Whether alerts are switched on at all.
 *
 * Defaults to on, and a failure to read the flag reads as *off* rather than as
 * "send anyway": the worst outcome here is an operator who does not get told a
 * withdrawal is waiting, and that is worth being conservative about while a
 * database blip lasts.
 */
async function isEnabled(): Promise<boolean> {
  try {
    return await settingBool(MONEY_ENABLED_SETTING, true);
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