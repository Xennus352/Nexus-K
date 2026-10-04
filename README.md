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
- **The sidebar is `sticky top-0 h-screen self-start`.** The main screen scrolls under it while the nav
  and the account card stay put. `self-start` is load-bearing: a flex aside is stretched to the
  document's height by default, and an element as tall as the document has nowhere to stick.
- **The sidebar's account card replaces the old VIP panel**: email, live balance (or the reason it is
  unavailable — "Balance unavailable" when the engine is down, "Account blocked" when the player is
  banned), and the referral code with a copy button.
- **Deposits are KPay and Wave only.** See [Proving a deposit](#proving-a-deposit).

### The game screen

- **Reels clip.** `.play-cell` carries `overflow: hidden` and `isolation: isolate`, and the settled
  symbol sits in `.cell-sym` above the roll layer. Without those, the roll layer's `y:-16` per step and
  `y:-22 scale 1.2` landing tween painted over the cell above — the "sticky/overlapping symbols" report.
  Measured, not assumed: with the roll held at its extreme frame, unclipped rendering differs from
  clipped across ~7,400 px spanning all four rows of a column, against ~200 px of background noise.
- **The console buttons are drawn in CSS.** `ConsoleButton.tsx` layers gradients, a bevel, a tinted
  glow, a press shadow and a specular sweep — no images, so they stay crisp at any DPI and cost no
  request. `cursor-pointer` throughout, and a disabled button reads as disabled rather than dead.
- **The bet controls are `MIN` / `MAX` / `AUTO` / `SPIN` / history.** `MIN` drops to the smallest
  playable bet rather than zero, which the engine rejects.
- **The balance moves in realtime.** `src/server/realtime.ts` relays the value the caller already has
  over a `BroadcastChannel` plus a parallel `localStorage` write — no polling, no WebSocket, nothing to
  keep alive. Messages are tagged with the uid so two accounts in one browser cannot cross-contaminate,
  and `CountUp` tweens between values and flashes the direction, honouring `prefers-reduced-motion`.
- **The background is the game's own art** (`scene.cabinet`, resolved per alias) with a darkening radial
  scrim, rather than flat black.
- **The route is `/play/[alias]`, outside the `(app)` route group on purpose.** As a member of `(app)`
  it inherited the shell's sidebar, topbar, mobile nav and `p-4 pb-24 md:p-6` content padding, so the
  "full-bleed" screen arrived inset inside a padded box with a nav rail down the side — and that padding,
  plus the cabinet, is what made the page scroll. The wrapper is `flex h-[100dvh] w-full
  overflow-hidden` with `main` at `flex-1`, measured at 0 px of document overflow on both a desktop and
  a 390 px phone viewport. `100dvh` rather than `100vh` because the mobile URL bar makes `vh` taller
  than the visible area, reintroducing exactly the scroll being removed.
- **Deposit**: per-rail fees, limits and currency lists, a checkout per driver, an instructions page
  for manual rails, and a status endpoint the detail page polls. Manual rails must attach the transfer
  screenshot — see [Proving a deposit](#proving-a-deposit).
- **Withdraw**: per-method payout fields (amount plus a KPay/Wave number, a bank account, a wallet
  address…), fee split, turnover rule, optional KYC gate, reserve-on-request. Every request and every
  deposit proof lands in Telegram — see [Money alerts](#money-alerts).
- **Bonuses**: daily bonus (once per day), welcome bonus, referral bonuses, deposit bonuses.
- **Notifications**: a bell in the topbar and an inline feed on `/account`, both fed by the player's
  own deposit and withdrawal rows — see [Notifications](#notifications).
- **My account** (`/account`): identity, referral code with a copy button, balance, turnover, KYC status,
  recent activity and the ledger. Read-only, and the one place a player can see their own state
  without hunting through the wallet.

### The boot screen

`src/components/LoadingScreen.tsx` is the giveaway screen on a cold lobby load: a gold-on-teal
mystical gradient with drifting clouds and rays, the `GIVEAWAY GIVEAWAY` banner in 3D relief
(dual-layer shadows, a stroke, a gold→red gradient fill), a `% COMPLETE` counter that visibly climbs
0→100, a golden metallic progress-bar frame with a fiery glowing fill, and flanking placeholder
slots for a dragon motif and a seated warrior. `(V1.0.113)` sits at the bottom.

- **Whether to show it at all is decided on the server**, in `/lobby`, from a seven-day cookie
  (`nk_lobby_boot`, `src/lib/boot-flag.ts`). This is the load-bearing detail. The overlay is part of
  the server-rendered HTML, so a client-side "has this browser seen it?" check can only *remove*
  markup that has already painted — measured, that leaves a warm revisit sitting behind a frozen
  `0% COMPLETE` screen for as long as the JS takes to load, eating clicks over a lobby that was
  ready the whole time. Asking the server in the page means a warm lobby is simply never wrapped.
  `sessionStorage` was the first attempt and cannot work: it is invisible to the server, which forces
  a client-side decision, which is the situation above.
- **`duration` is milliseconds and always treated as such.** The tween converts on the way in. Passing
  the prop straight to GSAP's `duration` looks right and is not: a 2400 ms request becomes a
  forty-minute run, the counter sits at 0 for the whole session, and the overlay never leaves — a
  loading screen that silently bricks the page behind it.
- **It always takes itself off the page.** `onLoadComplete` is optional, but an overlay faded to
  opacity 0 is still a `fixed inset-0` element eating every click, so both exit paths end in `null`.
- **The run lands on exactly 100** from `onComplete` and `onInterrupt` alike. A tween killed
  mid-flight — Strict Mode's double effect, a re-render, a backgrounded tab — must not leave a
  loading screen parked at 62%.
- One `gsap.context()` scoped to the root, with `gsap.matchMedia()` inside it, so a single
  `ctx.revert()` in `useLayoutEffect` tears down both the motion and the reduced-motion branch.

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

## Notifications

The bell in the topbar and the inline feed on `/account` are the same list, built by
`noticesFor()` in `src/server/notices.ts`.

- **A deposit that was approved *is* the notification that their deposit was approved.** The rows the
  player already owns are the feed. A separate notification store would need its own write at every
  settle and refund site, and the day one of those was missed the player would be told their deposit
  was pending forever — a bug invisible in testing, because the happy path still works.
- **Titles quote stored columns, never recomputed ones.** Coins and cash come from the row as it was
  approved, so a rate setting changing later cannot make an old notification disagree with the
  transaction it describes.
- **A rejection shows the operator's note verbatim.** "Why was my deposit rejected" is the question the
  bell exists to answer, and an empty body would send the player looking for someone to ask.
- **The list is server-rendered.** `(app)/layout.tsx` reads it into the bell, so the unread badge is
  correct on the very first paint instead of appearing a beat after the page. `/api/notifications`
  exists for the refresh the bell does while it is open, and that is all it is for.
- **Polling only runs while the panel is open**, and pauses while the tab is hidden. A closed bell has
  nothing to show.
- **Read state is per-device.** It is a "last seen" timestamp in `localStorage`, not a database column,
  because it is a preference about a device rather than a fact about the account. Server-side, signing
  in on a second device would silently mark everything read on the phone.

## Telegram alerts

Optional, and the only thing the bot does. Set `TELEGRAM_BOT_TOKEN` from
[@BotFather](https://t.me/BotFather) and the app will push a message for every deposit and withdrawal
that needs an operator.

The token is read from the environment only — never stored in the database, never logged, never sent to
the browser. Nothing in `src/lib/telegram.ts` throws: Telegram is a convenience channel, so an outage
degrades to "the operator was not told", never to a failed payout.

### Money alerts

Deposits and withdrawals alert a **list** of chats, because they want a different pair of eyes: a
casino's payout number is not something to read in the same channel as player chat.

- `/admin/settings` → **Send deposit & withdrawal alerts to Telegram** turns alerts off without
  deleting the list; the chat ids sit next to it. Blank falls back to `5458464856,6629148549`, so
  alerts work before anyone visits the settings page. At most eight ids, digits only.
- **"Detect from bot" is additive.** It reads the operator's chat from the bot's pending updates and
  *appends* it to the list. A button that replaced the list would silently stop alerting the second
  operator the moment anyone used it. Getting a token from BotFather does not tell you your own chat
  id, and looking it up by hand is a trap worth removing.
- **"Send test message" reports the fan-out.** It says how many of the configured chats accepted it,
  not a bare "sent" that would be true even if every delivery had 403'd.
- A **withdrawal** alert quotes the reference, the player, the coins, the cash the operator actually has
  to send, the fee, the rail, and every payout field verbatim — including the KPay or Wave number. An
  alert missing the number is worse than no alert, so it is rendered from the stored `account` JSON
  rather than reconstructed.
- A **deposit** alert carries the screenshot itself, so the operator can read the statement without
  opening a back office. If the photo fails to send anywhere, a text-only alert is sent instead, so a
  transfer is never silently unannounced.
- Alerts are **fire-and-forget**. The coins are already reserved and the row is already written, so a
  Telegram outage degrades to "open `/admin/withdrawals` to see it" rather than to a failed payout.
- Fan-out is sequential, not parallel. Ten players withdrawing at once would otherwise hit the Bot
  API's per-chat rate limit and lose the tail of the burst.
- Player-supplied text — usernames, gateway names, payout field labels — goes through `safe()` in
  `src/server/money-alerts.ts`, which collapses newlines and caps length. A player who registers with a
  display name containing a fake 🚨 banner cannot forge an operator message to the next reader.

### Proving a deposit

Manual rails are a promise from the player that money moved, so `/api/payments/checkout` requires a
screenshot for them and a screenshot alone is not enough — it is the only thing linking an amount to a
bank line.

- **KPay and Wave are the only rails a player is offered.** `PLAYER_RAILS` in `src/lib/gateways.ts`
  filters `playerGateways()`, and the rest of the catalogue stays in the database and stays editable at
  `/admin/gateways` — so undoing this is a one-word rename plus a driver change, not a code change.
  Enforced by a filter rather than by deletion on purpose, which means `pnpm db:e2e:http` asserts it:
  the suite loads the deposit page and fails if any other rail's id appears in it.
- **The rails are drawn as two wide logo tiles** with a hand-drawn radio and a lift on hover, using
  original SVG wordmarks (`public/gfx/payments/kpay.svg`, `wave.svg`) rather than the generic 400×180
  catalog art, which was a stock bank icon on both. Swapping in a real brand asset is a path change.
- **The file picker is custom, not a styled `<input type="file">`.** The native input is still there
  and still `sr-only`, so keyboard focus, the OS dialog and form semantics are unchanged — what the
  player touches is a button that opens it, and there is no default "Choose File" control on screen.
- **Object URLs are revoked on every change and on unmount.** The URL is created in the pick handler
  and owned by the same state as the file, so "which URL is live" is one value replaced and revoked in
  one step rather than two pieces of state that can disagree. A player who attaches several screenshots
  would otherwise leak every one of them for the life of the tab, and a 5 MB photo times a few attempts
  is enough to matter on a phone.
- **The player must attach the image.** The picker previews what was chosen, and the submit button
  stays disabled until there is one. There is no "submit without a screenshot" path for a manual rail.
- **The receiving number is a setting, not a seed value.** The casino's real KPay number is an operator
  decision, and a placeholder in a rail is worse than an empty one: a player would copy the placeholder
  and send real money to nobody. `deposit.receive_phone` and `deposit.receive_name` are read at render
  time (`fillPhoneRails` in `src/lib/gateways.ts`), so one edit in one screen changes every place the
  number appears. A rail with its own non-blank value keeps it, which is what lets a generic "Bank
  Account" rail carry its own details. **While the setting is empty the page says so in amber and the
  Copy button is not rendered** — copying an empty string reads as success and transfers nothing.
- **The content type is sniffed, never trusted.** `File.type` is client-supplied, so `src/lib/slips.ts`
  checks magic bytes and the stored extension comes from the sniffed type. A `.html` file renamed to
  `.png` and *declared* `image/png` is rejected.
- **Limits live in one module** (`MAX_SLIP_BYTES` = 5 MB, `MIN_SLIP_BYTES` = 64, image types only) so
  the browser and the server enforce identical numbers instead of drifting apart.
- **Slips are private.** Files are stored under `var/uploads/` (git-ignored, never `public/`) under a
  generated `<base36>-<32 hex>.<ext>` name, and served only by `/api/admin/slip/[trx]`, which checks
  an **admin** session — not the player's, so the player who uploaded it cannot read it back. The
  response is `no-store` + `nosniff` behind a CSP sandbox, and the filename is re-validated against a
  regex before any filesystem call.
- If the provider throws after the slip is written, the deposit row is rolled back and the file is
  deleted, so a failed checkout does not leave an orphan.

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
verification and staff accounts. Balance adjustments and player creation are superadmin-only,
and the last active superadmin cannot be demoted or deactivated.

### Tabs and paging

Every list in the back office is tabbed and pages **20 rows at a time**.

- **The tabs are `<Link>`s with real URLs.** A button plus local state is why the queue could not be
  linked to, the active tab vanished on a refresh, and the back button walked out of the page. `all` is
  the *absence* of a filter rather than a value of `all`, so `/admin/deposits` is the unfiltered list
  and the URL stays clean.
- **Tabs carry counts**, so they say how much is waiting rather than only what is on screen.
  `/admin/deposits` reads `All 76 · Accept 0 · Accepted 56 · Rejected 20` at a glance.
- **`PAGE_SIZE = 20` is exported once** from `src/components/admin/parts.tsx` and imported by both
  the query and the pager. They used to disagree — the ledger paged by 100 while `Pager` divided by 50,
  so it advertised twice the real page count and "Next" walked onto empty screens.
- **The pager's `base` must already carry the other active filters**, or paging drops them. Both queue
  pages build it from a `URLSearchParams`.
- **A banned player is visible in the money queues.** Deposit and withdrawal rows carry a `BANNED`
  chip, because approving money for a suspended account is exactly the mistake worth surfacing.
  The player list has its own **Banned** tab.

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

KPay and Wave are seeded on both sides of the app: as manual deposit rails whose receiving number comes
from settings, and as MMK payout methods asking for an account name plus a wallet number.

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

Two things are deliberately **not** in `.env`, because they are operator data rather than
configuration, and belong in the database where the back office can edit them:

- `deposit.receive_phone` / `deposit.receive_name` — the KPay/Wave number players transfer to. Set them
  at `/admin/settings` → **Payment**. Until they are set, the deposit page shows an amber "not
  configured yet" instead of a number, which is the safe failure: a wrong number loses money, a blank
  one loses nothing. `pnpm db:seed` does not fill them in — it never overwrites a setting you already
  have, so a value entered once survives every later seed.
- `money.telegram_chats` — the chat ids that receive deposit and withdrawal alerts. Blank falls back to
  `5458464856,6629148549`.

`TELEGRAM_BOT_TOKEN` is also required for alerts, but not for the back office: with no token the money
flows still work and the alerts simply do not go anywhere.

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
account when it is missing, and it never overwrites an existing setting, an operator's gateway
credentials or a rail's receiving number — re-seeding will not revert configuration you changed in
the back office. It *does* refresh a rail's `name`, `logo` and `sort`, because those are what the
player sees and there is nothing to configure about them; a stale asset path would break the deposit
tile rather than preserve a choice.

`pnpm db:apply-defaults` moves an already-seeded database onto a changed default, and retires the rows
for settings that no longer exist. `db:seed` only ever *creates* a missing setting, which is right for
an operator's edit and wrong for a default nobody has overridden — so this script exists as a
deliberate act rather than something seeding does behind your back. It also disables the generic
**Manual** bank rail and clears its account details: it used to ship enabled with an invented bank name,
IBAN and sort code, which is the one thing an operator is most likely to switch on and leave.

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
| `pnpm db:apply-defaults` | Move an existing database onto a changed seed default    |
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

  The deposit proof and slip privacy are covered here too, because they are the checks most likely to
  rot silently: a manual deposit with no screenshot is refused, a text file renamed to `.png` and
  declared `image/png` is refused by magic bytes and leaves no row behind, a real PNG is stored under a
  generated name with the sniffed type, and `/api/admin/slip/[trx]` returns 401 without a cookie, 401 to
  the player who uploaded it, the exact uploaded bytes to an admin, and 404 for a slip that never
  existed. A KPay withdrawal is driven through to a full refund, asserting the number and account name
  land on the row — those are what the Telegram alert quotes.

  It also asserts the **rails players are offered**. The catalogue keeps every rail it has ever had,
  because "only KPay and Wave" is enforced by a filter (`PLAYER_RAILS` in `src/lib/gateways.ts`) rather
  than by deleting rows they stay editable at `/admin/gateways`. That makes the filter worth a test: the
  moment someone widens it, a Stripe or a bank transfer is one keystroke from taking real money, so the
  suite loads the deposit page and fails if any other rail's id appears in it.

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