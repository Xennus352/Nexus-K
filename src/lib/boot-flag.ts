/**
 * Whether this browser has already been shown the lobby boot screen.
 *
 * **A cookie, and that choice is the whole design.** The decision has to be made
 * on the server, because the overlay is part of the server-rendered HTML — a
 * client-side check cannot un-send markup that has already painted, only remove
 * it once hydration lands. Measured: removing it from an effect meant a warm
 * revisit sat behind a frozen `0% COMPLETE` screen for as long as the JS took to
 * load (~0.6 s in dev), eating clicks over a lobby that was ready the whole time.
 * Reading a cookie in the page means a warm lobby is simply never wrapped, and
 * there is no artefact in any case: no flash, no hydration mismatch, nothing to
 * clean up.
 *
 * `sessionStorage` was the first attempt and it cannot work for this: it is
 * invisible to the server, so it forces a client-side decision, which is the
 * situation above.
 *
 * Seven days, not forever. This is a splash, not a preference — someone who
 * clears cookies, or comes back after a week, gets to see it again.
 */
export const BOOT_COOKIE = "nk_lobby_boot";

const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Client-only. Called as the run *starts*, not when it ends, so a second visit
 * landing mid-run skips rather than queueing behind it. Idempotent, which also
 * makes it safe under Strict mode's double-invoked effect.
 */
export function markBooted(): void {
  document.cookie = `${BOOT_COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax`;
}