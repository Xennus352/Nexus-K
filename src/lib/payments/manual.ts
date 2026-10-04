// Manual rails: the player transfers money however the casino wants (bank wire,
// local e-wallet, cash deposit) and an admin approves the deposit.
//
// No outbound HTTP at all, which is why it is the default: a fresh install can
// take money immediately without any third-party account.

import type { CheckoutResult, PaymentDriver, WebhookEvent } from "./driver";

export type ManualRail = { label: string; value: string; art?: string };

export const manualDriver: PaymentDriver = {
  id: "manual",
  name: "Manual / Bank Transfer",
  fields: [],

  configured: () => true,

  async create(): Promise<CheckoutResult> {
    // Nothing to call: the instructions live on the deposit detail page and an
    // admin flips the deposit to success from the back office.
    return { payUrl: "", reference: "", data: {} };
  },

  // There is no provider callback for a manual rail; the route exists so the
  // webhook shape stays uniform and a mis-pointed integration fails loudly.
  async parseWebhook(): Promise<WebhookEvent> {
    return { status: "pending", note: "Manual rails have no webhook" };
  },
};

/**
 * The rail list shown on the deposit instructions page. Stored as JSON on the
 * gateway when an admin fills the form in; older rows may hold the same
 * information as `Label: value` lines of the instructions textarea.
 */
export function manualRails(gateway: { rails: string; instructions: string }): ManualRail[] {
  try {
    const parsed = JSON.parse(gateway.rails) as unknown;
    if (Array.isArray(parsed)) {
      const rails = parsed.filter(
        (r): r is ManualRail =>
          !!r && typeof r === "object" && typeof (r as ManualRail).label === "string",
      );
      if (rails.length > 0) return rails;
    }
  } catch {
    /* fall through to the textarea form */
  }
  return gateway.instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cut = line.indexOf(":");
      return cut < 0
        ? { label: line, value: "" }
        : { label: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
    })
    .filter((r) => r.value);
}