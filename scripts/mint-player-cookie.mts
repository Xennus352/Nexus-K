/**
 * Dev-only helper: registers a throwaway player (engine + mongo) and prints the
 * `nk` cookie a browser would hold, so player pages and the money API routes can
 * be exercised with curl. Complements `mint-admin-cookie.mts`.
 *
 *   npx tsx --env-file=.env scripts/mint-player-cookie.mts [email] [password]
 *
 * Prints `nk=<cookie>` plus the engine uid and the starting balance.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { engineSignup, engineSigninPlayer, engineWalletGet, CID } from "@/lib/engine";
import { randomToken } from "@/lib/ids";

const email = process.argv[2] ?? `curl-${randomToken(6)}@nexus-k.test`;
const password = process.argv[3] ?? randomToken(10);

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.error(`a user already exists for ${email} — pass a fresh email`);
  process.exit(1);
}

const uid = await engineSignup(email, password, "curl");
if (uid === null) {
  console.error("engine signup failed — is the engine running?");
  process.exit(1);
}

const auth = await engineSigninPlayer(email, password);
if (!auth) {
  console.error("engine sign-in failed after signup");
  process.exit(1);
}

const user = await prisma.user.create({
  data: {
    email,
    passwordHash: await bcrypt.hash(password, 10),
    engineUid: auth.uid,
    username: email.slice(0, email.indexOf("@")),
    refCode: randomToken(8).toUpperCase(),
  },
});

const wallet = await engineWalletGet(auth.uid);

const claims = { email, uid: auth.uid, token: auth.access, at: Date.now() };
const cookie = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");

console.log(`nk=${cookie}`);
console.log(`# user   ${user.id}`);
console.log(`# email  ${email}`);
console.log(`# pass   ${password}`);
console.log(`# uid    ${auth.uid} (cid ${CID})`);
console.log(`# wallet ${wallet?.wallet ?? "?"}`);

await prisma.$disconnect();