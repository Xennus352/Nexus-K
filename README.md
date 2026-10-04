# Nexus-K 🎰

A casino web app built with **Next.js 16**, **pnpm**, **Prisma**, **MongoDB** and **GSAP**. A Go
[slotopol](https://github.com/slotopol/server) engine owns every play balance; the Next.js app owns
accounts, deposits, withdrawals and the back office.

Inspired by these open-source projects:

- [slotopol/server](https://github.com/slotopol/server.git) — slots game server (Go)
- [PrzemoProgrammer/Slot-Machine](https://github.com/PrzemoProgrammer/Slot-Machine.git) — classic slot machine (HTML/CSS/JS)
- [cornel-pe/live-casino](https://github.com/cornel-pe/live-casino.git) — live casino frontend (Next.js)

## Player area

- **Sign-in only** — there is no registration. Accounts are created by an operator (see below) and the
  player types the password they were given. Password fields have a show/hide toggle.
- The sign-in screen is an animated scene (`src/components/LoginScene.tsx`): the Zeus plate drifts
  behind, slot symbols float up past the card like a slow reel, and the title staggers in. One GSAP
  context drives it all and collapses to a static frame under `prefers-reduced-motion`.
- Lobby and slot machine with GSAP reels, streamed game data and pooled sound effects.
- **Wallet**: live balance, deposit/withdraw totals, transaction ledger, referral code, KYC submission.
- **Deposit**: per-rail fees, limits and currency lists, a checkout per driver, an instructions page
  for manual rails, and a status endpoint the detail page polls.
- **Withdraw**: per-method payout fields, fee split, turnover rule, optional KYC gate, reserve-on-request.
- **Bonuses**: daily bonus (once per day), welcome bonus, referral bonuses, deposit bonuses.
- **Support**: ticket list, new ticket, threaded replies, and an optional Telegram channel.

### Creating player accounts

There is no public sign-up. The `signup` server action was removed rather than just hidden, so there is
no endpoint left to call by hand. **Create a player account** on `/admin/users` is the only door in: it
provisions the engine account *and* the casino row together, sets the password, and pays the welcome
and referral bonuses — the same fan-out self-service registration used to do.

The form is superadmin-only, which is the same power tier as adjusting a balance by hand. It is a
native `<details>`, so it works with JavaScript disabled.

`login` still rebuilds a casino row for an email the engine already knows but this app does not. That
is a repair path for accounts created directly against the engine, not a sign-up form — it pays no
bonuses.

### Player passwords

**Existing passwords cannot be read.** `User.passwordHash` is a one-way bcrypt hash and the engine keeps
its own hashed secret, so there is no code path that can print one — not for an operator, not for a
debug query. That is the property that makes the hash worth having. There is deliberately no
"show all passwords" screen and no reversible column: either would turn a single database dump, or one
accidental read of the users collection, into a complete credential breach for accounts that hold real
balances.

What the back office can do instead is *set* passwords, which is how you end up holding them:

- **One player** — **Set password** on `/admin/users/<id>`. Writes the engine secret first, then the
  local hash, so a refusal from the engine cannot leave the two stores disagreeing.
- **Many players** — `/admin/users/credentials` (linked from the bottom of `/admin/users`). Pick players
  or tick *apply to everyone this search matches*, and it assigns a fresh password to each and renders a
  `email,username,password` CSV with copy and download buttons. Cap is 100 per run.

Both are superadmin-only, matching `createPlayer` and `adjustBalance`. This is worth understanding
before you use the bulk tool:

- Every password it sets is **new**. It replaces, it does not reveal.
- The sheet is held **in memory for ten minutes** and never written to the database, so it does not
  survive a server restart and does not work behind more than one instance. Copy or download it
  immediately.
- The engine is changed through `POST /user/secret`, which compares `oldsecret` unless the caller holds
  `ALadmin`. The bundled admin carries `ALadmin` through its *global* access level (`GAL`) — which
  `/prop/al/get` does not report, as it returns only the per-club `Access`. That is why a reset works
  for a password nobody ever saw. On an install whose engine admin lacks the flag, pass the current
  secret or the call is refused.
- Player sign-in authenticates **against the engine** and never reads `passwordHash`. A reset that
  touched only Prisma would look like it worked and then fail at the login form.
- A reset does **not** sign the player out. Sessions here are stateless httpOnly cookies, so there is
  nothing to revoke; a session issued before the reset stays valid for up to a day.

## Staff sign-in (`/portal`)

Back-office staff sign in at **`/portal`**, not at `/admin`. The two screens are deliberately
separate: the player cookie `nk` and the admin cookie `nk_admin` are signed independently and a player
session confers no admin rights, so `/portal` exists so an operator can type a staff password without
looking like the player login.

``/admin/login` still redirects there, so old bookmarks and runbooks keep working.

Note that `/` no longer links to `/portal`: the player sign-in screen used to carry three separate pointers away from its own job — a "Members sign in below" note, a "Staff portal" link in the scene footer, and the same link again in the form footer. All three are gone. Staff go straight to `/portal`, which still links back to `/` so an operator in the wrong place can get out.

## Telegram support

Optional. Set `TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/BotFather) and the app will:

- show a **"Message us on Telegram"** button on `/support` and on every ticket thread, deep-linking to
  the bot with the ticket number as the `/start` payload;
- push new tickets and player replies to the operator's chat.

The bot's `@username` is looked up from the token automatically. The chat that *receives* the
notifications is adopted once from `/admin/settings` → **Detect from bot**: open a chat with the bot,
send it anything, press the button. That exists because a token from BotFather does not tell you your
own chat id, and looking it up by hand is a support trap.

The token is read from the environment only — never stored in the database, never logged, never sent to
the browser. Nothing in `src/lib/telegram.ts` throws: Telegram is a convenience channel, so an outage
degrades to "the button is not rendered", not to a failed ticket submission.

## Art

Every cabinet's art is derived from a pack, keyed off the game's name in `src/lib/theme.ts`. Packs are
matched **in order**, so a narrower keyword set has to be checked before a broader one.

| Pack      | Reel symbols                      | Backdrop                       |
| --------- | --------------------------------- | ------------------------------ |
| `kemet`   | 5 framed gems + frames + mascot   | full Egyptian room             |
| `zeus`    | 28 symbols + control plates       | 3 painted Olympus scenes       |
| `viking`  | LUX symbols                       | nordic panorama (from textures)|
| `egypt`   | 7 emblems                         | themed cabinet                 |
| `lux`     | 28 symbols                        | theme palette                  |
| `fantasy` | pixel symbols                     | fantasy cabinets               |
| `classic` / `fruits2` / `pixelfood` | fruit and pixel sets   | theme palette                  |

### Regenerating the art

`public/assets/` is gitignored and holds the raw drops. Two scripts turn them into the committed WebP
under `public/gfx/`:

```bash
./scripts/optimize-upload-code.sh   # public/Upload_Code/  -> public/gfx + public/sfx
./scripts/optimize-assets.sh        # public/assets/       -> public/gfx
```

`optimize-assets.sh` handles the three newer packs. Two things it does that are worth knowing:

- **The Zeus pack was cropped out of one sprite atlas**, so every symbol and button still has the
  atlas background baked in — an opaque `rgb(20,28,38)` field, exactly as its `README.txt` warns. Its
  alpha is derived from a luminance ramp, which cuts the subjects out while keeping the dark interior
  detail a flood-fill would eat. Without this the symbols render as dark rectangles on the reel.
- **The gptViking drop is unusable as reel art.** It is 38 low-poly FBX models but only their diffuse
  textures were exported, and a UV atlas cannot be a symbol — every one of them measures 56–64 distinct
  colours after quantising to 64, i.e. pure noise. What they *do* carry is material and palette, so the
  script dissolves eight of them into one wide panorama (moss, wet pine, snow, granite, iron) and that
  becomes the viking backdrop. The crop offsets are fixed rather than random so re-running is
  byte-stable.

## Back office (`/admin`)

Dashboard, reports, deposits, withdrawals, ledger, payment rails, payout methods, settings, players,
tickets, verification and staff accounts. Balance adjustments and player creation are superadmin-only,
and the last active superadmin cannot be demoted or deactivated.

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
| `./scripts/optimize-upload-code.sh` | Rebuild `public/gfx` + `public/sfx` from `public/Upload_Code/` |
| `./scripts/optimize-assets.sh`      | Rebuild the zeus/egypt/viking art from `public/assets/`    |

### Testing the money paths

Both suites need the engine running on `:8080` and a served build (`pnpm start`) on `:3000`. Each run
creates throwaway players, so they are safe to re-run.

- `pnpm db:e2e` exercises settlement logic directly: signup, admin credit, manual deposit approval
  (twice, to prove the replay is a no-op), daily bonus, withdrawal payout, cancellation and refund,
  overdraft refusal, and finally that the ledger reconciles with the live wallet to the coin.
- `pnpm db:e2e:http` drives the same paths the way a browser does — real cookies, the player API
  routes, and the admin buttons replayed from their rendered forms. This is the layer that catches a
  server action that was never wired to a form, which a logic-only test cannot see. It also covers
  `/portal`, the `/admin/login` redirect, and back-office player creation end to end: the row and the
  engine account, the welcome bonus, a duplicate refusal, and a referral paying both sides. It also
  covers the credential tools — a per-player reset proving the engine accepts the new secret and
  rejects the old one, the 6-character floor, and a bulk run asserting that the confirmation box is
  required, that the generated password in the CSV actually signs in, and that a guessed report token
  renders the expiry notice rather than a sheet.

  It mints both cookies **before** any request goes out. The mint spawns `tsx`, which blocks the event
  loop; a keep-alive socket opened before that goes stale and the next request dies mid-body with
  `UND_ERR_SOCKET`, which looks exactly like a server bug.

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

Note that server actions are not plain form POSTs: `curl -X POST /portal` returns 200 and sets no
cookie. Mint the cookie instead. A form that *is* rendered carries an `$ACTION_ID` and can be replayed
as multipart POST — that is exactly how `pnpm db:e2e:http` drives the back office.

> ⚠️ Never commit `.env` or share production credentials publicly. `public/assets/` and
> `public/Upload_Code/` are gitignored; only the derived assets under `public/gfx/` and `public/sfx/`
> are committed. If credentials were posted anywhere, rotate them — MongoDB Atlas → Database Access →
> Edit password, and Telegram → BotFather → `/revoke`.
>
> `TELEGRAM_BOT_TOKEN` is a full write credential for the bot. The token this project was developed
> against was pasted into a chat, so **rotate it before going live** and paste the replacement into
> `.env` only.