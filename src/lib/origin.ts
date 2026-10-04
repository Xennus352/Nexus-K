// The site's own absolute origin.
//
// Needed wherever an absolute URL is handed to something else — currently the
// payment providers, which build their callback URLs from it. `PUBLIC_URL` wins
// when set, because a proxy in front of the app rewrites `Host` and the provider
// would then be told to call the wrong host.
//
// This used to also build the referral link a player shared. That is gone: with
// self-service registration closed, there is no signup form to read `?ref=`, and
// an operator attaches a code when opening an account, so a shared link would
// resolve to a sign-in page that quietly ignores the parameter.

import { headers } from "next/headers";

export async function publicUrl(): Promise<string> {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}