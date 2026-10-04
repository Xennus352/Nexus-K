// Referral codes.
//
// Split out of the player actions so the back office can mint one when it
// provisions an account by hand: players no longer register themselves, so
// `createPlayer` is now the only path that needs a fresh code.

import { prisma } from "@/lib/prisma";
import { randomCode } from "@/lib/ids";

/** Fresh, unguessable referral code, retried on the (unlikely) collision. */
export async function newRefCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    const taken = await prisma.user.findFirst({ where: { refCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  // Five eight-character collisions would mean randomCode is broken; fall back to
  // something long enough that it does not matter.
  return randomCode(12);
}