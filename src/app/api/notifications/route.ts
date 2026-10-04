// The player's own money events, refreshed on demand.
//
//   GET /api/notifications
//
// The list itself is built in src/server/notices.ts and rendered into the page by
// the (app) layout, so the topbar badge is correct on the very first paint. This
// route exists for the *refresh* the bell does while it is open, and for any
// second client that wants the same list without a full server render.
//
// Read state deliberately lives in the browser (a "last seen" timestamp in
// localStorage) rather than in the database. It is a per-device preference, not a
// fact about the account, and storing it server-side would mean every player who
// signs in on a second device silently marks everything read on their phone.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { noticesFor } from "@/server/notices";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  return NextResponse.json({ notices: await noticesFor(user.id) });
}