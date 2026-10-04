// Push a changed seed default — and a one-off data correction — into a database
// that was seeded before the change.
//
// `pnpm db:seed` deliberately only *creates* settings that are missing, so an
// operator's edit is never clobbered by a deploy. That is the right rule for a
// value somebody chose, and the wrong one for a default nobody has overridden —
// so the defaults that changed are listed explicitly here, and running this is a
// deliberate act rather than something `db:seed` does behind your back.
//
//   pnpm tsx --env-file=.env scripts/apply-seed-defaults.mts
//
// Adding to CHANGED is the normal way to move an existing install onto a new
// default. Leave it alone for anything an operator might have set.

import { prisma } from "@/lib/prisma";

/** Settings whose default changed after first run. */
const CHANGED = [{ key: "bonus.daily", value: "1000" }];

/** Keys removed from SETTING_DEFS. Their rows are deleted so the back office stops
 *  listing fields nothing reads. */
const RETIRED = [
  "tickets.enabled",
  "support.telegram_enabled",
  "support.telegram_chat",
  "support.telegram_handle",
];

for (const { key, value } of CHANGED) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  console.log(`${key} = ${value}`);
}

const gone = await prisma.setting.deleteMany({ where: { key: { in: RETIRED } } });
console.log(`removed ${gone.count} retired setting rows`);

// The generic "Manual" rail shipped enabled with an invented bank name, IBAN, BIC
// and sort code. Players were then restricted to KPay and Wave, so the row is only
// reachable from the back office — which is exactly where someone would switch it
// on and leave it. Blank the details and turn it off; making it usable again is a
// deliberate fill-in at /admin/gateways.
const rails = JSON.stringify([
  { label: "Bank", value: "", art: "/gfx/payments/01.webp" },
  { label: "Wire / SWIFT", value: "", art: "/gfx/payments/06.webp" },
  { label: "E-Wallet", value: "", art: "/gfx/payments/12.webp" },
]);
await prisma.gateway.update({
  where: { alias: "Manual" },
  data: { status: false, rails, instructions: "" },
});
console.log("Manual rail: disabled, invented account details cleared");

/* ----------------------------------------------- accounts the filters cannot see */

// `User.status` is `String @default("active")`, and the client applies that default,
// so every row written by this code has a value. On at least one database there are
// a couple of older rows with no value at all — from some create path that predates
// the field — and they are genuinely unreachable through the typed client:
//
//   * read back as "active" by `findMany`, because Prisma falls back to the
//     schema default when serialising a document that is missing the field;
//   * matched by *no* status filter, so they are absent from the Active count, the
//     Banned count and any `groupBy`, and the two tab counts stop adding up to the
//     total.
//
// Nothing in this script can repair them — there is no query that selects them and
// no update that targets them — so this only reports. It is here because the
// symptom surfaces as a 500 on /admin/users and the cause is invisible from the
// page that shows it.
const [users, active, banned] = await Promise.all([
  prisma.user.count(),
  prisma.user.count({ where: { status: "active" } }),
  prisma.user.count({ where: { status: "blocked" } }),
]);
if (active + banned === users) {
  console.log(`accounts reconcile: ${active} active + ${banned} blocked = ${users}`);
} else {
  console.log(
    `WARNING  accounts do not reconcile: ${active} active + ${banned} blocked != ${users} total. ` +
      `${users - active - banned} row(s) have no readable status — MongoDB $ne does not match a missing field. ` +
      "They cannot be selected or updated through Prisma; fix them at the collection level.",
  );
}

await prisma.$disconnect();
