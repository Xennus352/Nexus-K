// Cross-tab balance updates.
//
// A player's balance can move without any of their own tabs asking for it: they
// have the game open in one tab and the wallet in another, or they approve a
// deposit in a third. Both the old balance and the new one are already in the
// browser, so the honest way to keep every tab in step is to broadcast the new
// figure rather than have each tab re-poll the engine for a number it does not
// have.
//
// Deliberately not WebSockets. The engine is the authority on the balance; this
// only relays a value somebody already has. A dropped message costs one stale
// number until the next spin, and `onSpin` is wired to every mutation that
// matters, so the fallback is a re-render rather than a permanent divergence.
//
// `BroadcastChannel` is used when present (every current browser). The
// `localStorage` write is not a fallback so much as a second, independent path:
// a `storage` event fires in *other* tabs even where BroadcastChannel is
// unavailable or partitioned, and it costs one tiny key. Coordinates are
// deliberately not compared — two tabs reconciling at once is fine, they converge
// on the same figure.

const KEY = "nk:balance";
const CHANNEL = "nk:balance";

export type BalanceUpdate = {
  /** Engine uid, so a tab signed in as someone else ignores it. */
  uid: number;
  balance: number;
};

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

/**
 * Publishes a new balance to the player's other tabs.
 *
 * Fire-and-forget and never throws: this is a convenience on top of a value the
 * caller has already been told, so a storage quota error must not fail a spin.
 */
export function publishBalance(update: BalanceUpdate): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(update);
  try {
    channel()?.postMessage(update);
  } catch {
    /* channel closed or partitioned */
  }
  try {
    localStorage.setItem(KEY, payload);
  } catch {
    /* private mode, or quota — BroadcastChannel already carried it */
  }
}

/**
 * Subscribes to balance updates from the player's other tabs.
 *
 * `onUpdate` is called only for the given uid, so one browser signed into two
 * accounts does not cross-contaminate them. Returns an unsubscribe function.
 */
export function subscribeBalance(uid: number, onUpdate: (balance: number) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const deliver = (value: unknown) => {
    const u = value as BalanceUpdate | null;
    if (!u || typeof u.balance !== "number" || u.uid !== uid) return;
    onUpdate(u.balance);
  };

  const bc = channel();
  const onMessage = (e: MessageEvent) => deliver(e.data);
  bc?.addEventListener("message", onMessage);

  // A `storage` event only fires in *other* documents, which is exactly what is
  // wanted here — this tab already knows, and re-applying it would restart the
  // count-up tween for no reason.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      deliver(JSON.parse(e.newValue));
    } catch {
      /* not ours */
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    bc?.removeEventListener("message", onMessage);
    bc?.close();
    window.removeEventListener("storage", onStorage);
  };
}