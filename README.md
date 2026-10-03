# Nexus-K 🎰

A casino-style web app built with **Next.js 16**, **pnpm**, **Prisma**, **MongoDB** and **GSAP**.
Inspired by these open-source projects:

- [slotopol/server](https://github.com/slotopol/server.git) — slots game server (Go)
- [PrzemoProgrammer/Slot-Machine](https://github.com/PrzemoProgrammer/Slot-Machine.git) — classic slot machine (HTML/CSS/JS)
- [cornel-pe/live-casino](https://github.com/cornel-pe/live-casino.git) — live casino frontend (Next.js)

## Features

- Email/password auth (bcrypt, signed httpOnly session cookie)
- 3×3 slot machine with GSAP reel animations
- Server-authoritative bets/wins and balance stored in MongoDB via Prisma

## Setup

```bash
pnpm install
cp .env.example .env   # fill in your MongoDB credentials
pnpm db:push           # sync Prisma schema to MongoDB

# game engine (slotopol server, Go)
cd engine && ./slotopol web &   # listens on :8080
cd ..

pnpm dev
```

The `engine/` directory contains a Go build of [slotopol/server](https://github.com/slotopol/server) — the real game math for ~350 slot games (Novomatic, NetEnt, CT Interactive, and more). The Next.js UI talks to it through an authenticated proxy at `/api/engine/*`. If you need to rebuild the engine: install Go, `cd engine && go build -o slotopol .`.

## Scripts

| Command        | Action                     |
| -------------- | -------------------------- |
| `pnpm dev`     | Start dev server           |
| `pnpm build`   | Production build           |
| `pnpm db:push` | Push Prisma schema to DB   |

> ⚠️ Never commit `.env` or share production credentials publicly. If credentials were posted anywhere, rotate them (MongoDB Atlas → Database Access → Edit password).
