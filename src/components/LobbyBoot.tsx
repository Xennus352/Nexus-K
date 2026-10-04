"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import { markBooted } from "@/lib/boot-flag";

/**
 * Holds the giveaway boot screen over the lobby, once per browser.
 *
 * Deliberately not tied to the data fetch: the games are already awaited on the
 * server, so by the time this mounts the grid is ready to paint and a "loading"
 * gate would be a lie about where the wait is. What it covers instead is the
 * first paint of the lobby after a cold navigation — the moment the browser is
 * decoding a few hundred game thumbnails — which is the part that actually looks
 * broken without it.
 *
 * **Whether to show it at all is decided on the server**, in
 * `src/app/(app)/lobby/page.tsx`, from the cookie in `src/lib/boot-flag.ts`:
 * this component is only mounted for a browser that has not seen the screen
 * before. The reason is not tidiness — it is that the overlay is server-rendered,
 * so a client-side "have we shown it yet?" check can only remove markup that has
 * already painted, leaving a frozen `0% COMPLETE` screen over a lobby that was
 * ready all along. Asking the server means a warm lobby is never wrapped at all.
 *
 * `done` is sticky and never reset, so re-running the boot on every filter
 * keystroke cannot happen either.
 */
export default function LobbyBoot({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    markBooted();
  }, []);

  // The children stay mounted underneath the overlay the whole time rather than
  // being swapped in after it, so the thumbnails decode while the counter runs
  // and the reveal shows a page that is already warm.
  return done ? (
    children
  ) : (
    <>
      <LoadingScreen duration={2400} onLoadComplete={() => setDone(true)} />
      {/* Hidden from assistive tech while covered: the same links are a tap
          away behind a full-screen overlay, and announcing them there and
          again after the reveal makes a screen reader say everything twice. */}
      <div aria-hidden>{children}</div>
    </>
  );
}