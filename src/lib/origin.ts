// The site's own absolute origin.
//
// Needed wherever an absolute URL is handed to something else: payment
// providers building their callback URLs, and referral links shared with a
// player. `PUBLIC_URL` wins when set, because a proxy in front of the app
// rewrites `Host` and the provider would then be told to call the wrong host.

import { headers } from "next/headers";

export async function publicUrl(): Promise<string> {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Link a player shares to refer a friend; the signup form reads `?ref=`. */
export async function referralLink(code: string): Promise<string> {
  return `${await publicUrl()}/?ref=${encodeURIComponent(code)}`;
}