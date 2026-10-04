# Nexus-K 🎰

A casino web app built with **Next.js 16**, **pnpm**, **Prisma**, **MongoDB** and **GSAP**. A Go
[slotopol](https://github.com/slotopol/server) engine owns every play balance; the Next.js app owns
accounts, deposits, withdrawals and the back office.

Inspired by these open-source projects:

- [slotopol/server](https://github.com/slotopol/server.git) — slots game server (Go)
- [PrzemoProgrammer/Slot-Machine](https://github.com/PrzemoProgrammer/Slot-Machine.git) — classic slot machine (HTML/CSS/JS)
- [cornel-pe/live-casino](https://github.com/cornel-pe/live-casino.git) — live casino frontend (Next.js)

## Player area

- Email/password auth against bcrypt, in a signed httpOnly cookie.
- Lobby and 3×3 slot machine with GSAP reels, streamed game data and pooled sound effects.
- **Wallet**: live balance, deposit/withdraw totals, transaction ledger, referral code, KYC submission.
- **Deposit**: per-rail fees, limits and currency lists, a checkout per driver, an instructions page
  for manual rails, and a status endpoint the detail page polls.
- **Withdraw**: per-method payout fields, fee split, turnover rule, optional KYC gate, reserve-on-request.
- **Bonuses**: daily bonus (once per day), welcome bonus, referral bonuses, deposit bonuses.
- **Support**: ticket list, new ticket, threaded replies.

## Back office (`/admin`)

Dashboard, reports, deposits, withdrawals, ledger, payment rails, payout methods, settings, players,
tickets, verification and staff accounts. Balance adjustments are superadmin-only, and the last
active superadmin cannot be demoted or deactivated.

## How money moves

The engine's wallet is authoritative, and **`src/lib/wallet.ts` is the only thing that moves it** —
every deposit credit, withdrawal debit, bonus payout and admin adjustment goes through `move()` or
`claimBonus()`, which always write a matching `Transaction` ledger row holding the balance immediately
after the movement. That is what makes the ledger in `/admin/transactions` trustworthy: coins in
always equal coins out.

Two invariants are enforced by `src/lib/settle.ts`:

- **Settlement is idempotent.** Every state change claims the record first with a conditional update
  (`updateMany({ where: { id, status: "pending" } })`), which returns 1 to the caller that won the race
  and 0 to everyone after. Only the winner may touch the wallet, so a retried webhook, a polled status
  page or a double-clicked Approve button all pay at most once.
- **Withdrawal coins are reserved at request time.** The debit happens when the player asks, not when
  an operator approves, so a balance cannot be promised to five payouts at once. Cancelling refunds it.

Payment rails sit behind the `PaymentDriver` interface in `src/lib/payments/`. Four have working
drivers — `manual`, `stripe`, `paypal`, `nowpayments`. The rest are seeded as rows so an operator can
switch them on once credentials are entered, but a rail only appears on the deposit page when its
driver reports itself configured, so an unconfigured rail can never be chosen by a player.

## Setup

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL and SESSION_SECRET
pnpm db:push                  # sync the Prisma schema to MongoDB

# game engine (slotopol server, Go)
cd engine && ./slotopol web & # listens on :8080
cd ..

pnpm db:seed                  # settings, payment rails, payout methods, first admin
pnpm dev
```

`engine/` contains a Go build of [slotopol/server](https://github.com/slotopol/server) — the real game
math for ~350 slot games (Novomatic, NetEnt, CT Interactive and more). The Next.js UI talks to it
through an authenticated proxy at `/api/engine/*`. To rebuild it: install Go, then
`cd engine && go build -o slotopol .`

The engine's admin account (`admin@example.org` / `0YBoaT` by default) is what authorises wallet
movements: `/prop/wallet/add` requires the `ALbooker` permission, which player tokens never hold. The
app signs in as that admin once per process and memoises the token — see `src/lib/engine.ts`. Change
`SLOTOPOL_ADMIN_EMAIL` / `SLOTOPOL_ADMIN_SECRET` for a non-default engine install.

New engine players start with 1000 coins.

### Seeded admin

`pnpm db:seed` creates `admin@nexus-k.test` / `nexus-admin` (username `admin`, role `superadmin`)
unless `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_USERNAME` override it. The seed only creates that
account when it is missing, and it never overwrites an existing gateway, payout method or setting —
re-seeding will not revert configuration you changed in the back office.

## Scripts

| Command               | Action                                                     |
| --------------------- | ---------------------------------------------------------- |
| `pnpm dev`            | Start the dev server                                       |
| `pnpm build`          | Production build                                           |
| `pnpm start`          | Serve the production build                                 |
| `pnpm lint`           | ESLint                                                     |
| `pnpm typecheck`      | `tsc --noEmit`                                             |
| `pnpm db:push`        | Push the Prisma schema to MongoDB                          |
| `pnpm db:seed`        | Seed settings, rails, payout methods and the first admin   |
| `pnpm db:e2e`         | Money-path test against a live engine                      |
| `pnpm db:e2e:http`    | Same paths again, driven over HTTP through the real pages  |

### Testing the money paths

Both suites need the engine running on `:8080` and a served build (`pnpm start`) on `:3000`. Each run
creates a throwaway player, so they are safe to re-run.

- `pnpm db:e2e` exercises settlement logic directly: signup, admin credit, manual deposit approval
  (twice, to prove the replay is a no-op), daily bonus, withdrawal payout, cancellation and refund,
  overdraft refusal, and finally that the ledger reconciles with the live wallet to the coin.
- `pnpm db:e2e:http` drives the same paths the way a browser does — real cookies, the player API
  routes, and the admin buttons replayed from their rendered forms. This is the layer that catches a
  server action that was never wired to a form, which a logic-only test cannot see.

### Dev helpers

`scripts/*.mts` are development tools, not part of the app:

- `mint-admin-cookie.mts [email]` prints a signed `nk_admin` cookie so the back office can be curled.
- `mint-player-cookie.mts [email] [password]` registers a throwaway player and prints their `nk`
  cookie.

```bash
npx tsx --env-file=.env scripts/mint-admin-cookie.mts
curl -H "Cookie: nk_admin=$(npx tsx --env-file=.env scripts/mint-admin-cookie.mts | cut -d= -f2-)" \
  http://localhost:3000/admin
```

Note that server actions are not plain form POSTs: `curl -X POST /admin/login` returns 200 and sets no
cookie. Mint the cookie instead.

`scripts/optimize-upload-code.sh` regenerates `public/gfx/` and `public/sfx/` from the Laravel dump in
`public/Upload_Code/` (image/audio transcoding, plus the two sound effects that the dump does not
contain and that are derived from `spin.mp3` with ffmpeg).

> ⚠️ Never commit `.env` or share production credentials publicly. If credentials were posted
> anywhere, rotate them (MongoDB Atlas → Database Access → Edit password). `public/Upload_Code/` is
> gitignored; only the derived assets under `public/gfx/` and `public/sfx/` are committed.