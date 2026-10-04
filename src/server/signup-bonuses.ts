// Bonuses paid when an account is created.
//
// Split out of the `signup` action so the fan-out — one claim for the new
// player, one for the referrer — can be exercised without a browser. Each claim
// is independently idempotent, so calling this twice for the same account pays
// only once.

import { claimBonus, type MoveResult, type WalletError } from "@/lib/wallet";
import { settingNumber } from "@/lib/settings";

export type SignupBonusResult = {
  welcome: boolean;
  referral: boolean;
  /** The referrer was paid even though they have no engine wallet yet. */
  referrerUnpaid: boolean;
};

/**
 * Pays the welcome bonus and, when the account arrived through a referral link,
 * the referral bonus on both sides.
 *
 * Failures are swallowed on purpose: a wallet outage must not cost a player
 * their account, and `claimBonus` releases its claim when it cannot pay, so an
 * operator can still settle it by hand.
 */
export async function paySignupBonuses(args: {
  userId: string;
  engineUid: number;
  email: string;
  referrer: { id: string; engineUid: number | null } | null;
}): Promise<SignupBonusResult> {
  const result: SignupBonusResult = { welcome: false, referral: false, referrerUnpaid: false };

  const welcome = await settingNumber("bonus.welcome", 0);
  if (welcome > 0) {
    const paid: MoveResult | WalletError = await claimBonus({
      userId: args.userId,
      engineUid: args.engineUid,
      kind: "welcome",
      amount: welcome,
      memo: "Welcome bonus",
      period: "signup",
    });
    result.welcome = paid.ok;
  }

  const referral = await settingNumber("bonus.referral", 0);
  if (referral <= 0 || !args.referrer) return result;

  // Keyed on the counterparty so neither side can claim twice for one pairing:
  // the newcomer only ever has one signup, and the referrer is paid once per
  // account they bring in.
  const mine: MoveResult | WalletError = await claimBonus({
    userId: args.userId,
    engineUid: args.engineUid,
    kind: "referral",
    amount: referral,
    memo: "Referral bonus",
    period: `signup:${args.referrer.id}`,
  });
  result.referral = mine.ok;

  const theirs: MoveResult | WalletError = await claimBonus({
    userId: args.referrer.id,
    engineUid: args.referrer.engineUid,
    kind: "referral",
    amount: referral,
    memo: `Referral bonus for ${args.email}`,
    period: args.userId,
  });
  result.referrerUnpaid = !theirs.ok;

  return result;
}