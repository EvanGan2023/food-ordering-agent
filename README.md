# Food Ordering Agent

Open-source AI ordering agent for restaurants. Customers say or type what they want, the agent builds the order from the restaurant's menu, asks only for missing choices and the owner's questions, and the order goes to the kitchen.

> Status: early MVP. Runs locally with a fictional demo restaurant and a built-in kitchen screen. Square integration is next.

## What's in it

- **Ordering link**: a page restaurants embed on their own website (script snippet), so customers order ahead and skip the line.
- **Kiosk / iPad mode**: a "What would you like?" bar with push-to-talk, plus a classic tap menu.
- **Live cart**: tap to fix small things, or talk/type to make bigger changes at any time before paying.
- **Owner questions**: the restaurant decides what to ask (name, dine-in or takeaway, pickup time, allergy note...).
- **Kitchen screen**: a stand-in for the POS while testing.
- **Pluggable AI**: Anthropic (default), OpenAI or OpenRouter, using the restaurant's own key.
- **Voice**: ElevenLabs speech-to-text (Scribe) and spoken replies (Flash), with the browser's speech recognition as a free fallback.

## Quick start

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env    # add ANTHROPIC_API_KEY for the agent, ELEVENLABS_API_KEY for voice
pnpm dev
```

Then open:

| Page | URL |
| --- | --- |
| Start page | http://localhost:3000 |
| Ordering link | http://localhost:3000/order/demo |
| Kiosk / iPad | http://localhost:3000/kiosk |
| Kitchen screen | http://localhost:3000/kitchen |
| Owner settings | http://localhost:3000/admin |
| Embed example | http://localhost:3000/embed-demo |

Without an API key, everything except the AI chat works (tap ordering, questions, checkout, kitchen). Without an ElevenLabs key, the mic uses the browser's speech recognition (Chrome or Safari) and replies are text only. Restart `pnpm dev` after editing `.env`.

Data is stored in an embedded Postgres (PGlite) under `.data/`. Delete that folder to reset. Set `DATABASE_URL` to use a real Postgres server.

## Commands

```sh
pnpm test                         # unit tests, no API key needed
pnpm typecheck
pnpm menu                         # print the demo menu
pnpm --filter @foa/agent eval     # grade the real AI agent on the sample orders (needs a key)
```

## Demo menu: Patty & Co.

A fictional burger shop laid out like a typical quick-service menu: meals, burgers, chicken, sides, drinks, coffee, desserts, a kids pack and breakfast (05:00–10:30). All names are original. Prices (AUD) and allergens are made up for testing. It covers defaults, required choices the agent must ask about, choice limits, option prices, time-limited and sold-out items.

`evals/demo-orders.json` pairs customer sentences with the cart the agent should build.

## Layout

```
packages/core    menu schema, cart engine, search, owner questions, shared API types, demo menu
packages/agent   LLM agent: tools, prompt, provider choice, eval runner
apps/server      API (Hono), database, POS adapter
apps/web         ordering link, kiosk, kitchen screen, owner settings, embed script
evals            sample orders and expected carts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Licence

[Apache-2.0](LICENSE)
