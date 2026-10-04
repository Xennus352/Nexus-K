/**
 * Dev-only helper: mints an `nk_admin` cookie so a browser session can be
 * exercised with curl. Not part of the app — see README for usage.
 *
 *   npx tsx --env-file=.env scripts/mint-admin-cookie.ts admin@nexus-k.test
 */
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

const email = process.argv[2] ?? "admin@nexus-k.test";
const secret = process.env.SESSION_SECRET ?? "nexus-k-dev-secret";

const admin = await prisma.admin.findUnique({ where: { email } });
if (!admin) {
  console.error(`no admin with email ${email}`);
  process.exit(1);
}

const claims = {
  id: admin.id,
  username: admin.username,
  email: admin.email,
  name: admin.name,
  role: admin.role,
  at: Date.now(),
};
const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
const mac = createHmac("sha256", secret).update(body).digest("base64url");
console.log(`nk_admin=${body}.${mac}`);
await prisma.$disconnect();