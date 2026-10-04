// Serves a deposit screenshot to the back office.
//
//   GET /api/admin/slip/[trx]
//
// The whole reason slips live outside `public/`: a screenshot of a bank statement
// carries a name, a balance and a transaction list, so it must never be
// fetchable by anyone who can guess a URL. This route is the only way to read
// one, and it requires a live back-office session.
//
// A trx that does not exist, or one the caller cannot see, both answer 404 with
// an empty body — the same response either way, so the route cannot be used to
// confirm that a reference is real.

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { readSlip } from "@/server/slips";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ trx: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) return new NextResponse(null, { status: 401 });

  const { trx } = await params;
  const deposit = await prisma.deposit.findUnique({
    where: { trx: decodeURIComponent(trx) },
    select: { slipPath: true, slipType: true, slipName: true },
  });
  if (!deposit?.slipPath) return new NextResponse(null, { status: 404 });

  const bytes = await readSlip(deposit.slipPath);
  if (!bytes) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": deposit.slipType || "application/octet-stream",
      "content-length": String(bytes.length),
      // Slips are financial records, not assets: never cached by a shared proxy,
      // never sniffed into something executable, and never framed.
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": `inline; filename="${(deposit.slipName || "slip").replace(/[^\w.\- ]/g, "")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}