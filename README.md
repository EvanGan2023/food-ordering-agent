# Food Ordering Agent

Open-source AI ordering agent for restaurants. Customers say or type what they want, the agent builds the order from the restaurant's menu, asks only for missing choices and the owner's questions, and the order goes to the kitchen.

> Status: early MVP. Runs locally with a fictional demo restaurant and a built-in kitchen screen. Square integration is next.

## What's in it

- **Agent-only screens**: no menu to scroll. The restaurant keeps its own menu boards and website; customers just say or type their order to the agent (an animated orb shows when it's listening, thinking or speaking).
- **Ordering link**: the agent page restaurants embed on their own website (script snippet), so customers order ahead and skip the line.
- **Kiosk**: built for a portrait screen (a monitor turned 90°, e.g. 1080×1920), with a "Just say what you'd like" start screen; a landscape tablet also works.
- **Confirms guesses**: only items and choices the customer names with the menu's own words (or an alias the owner added) go straight in. A misheard or loose order ("spicy chikken burger", "a coke") gets "Did you mean…?" with Yes/No buttons, and nothing is added until they say yes.
- **Live order**: tap a line to fix it (quantity, options, remove), or talk/type to make bigger changes at any time before paying.
- **Owner questions**: the restaurant decides what to ask (name, dine-in or takeaway, pickup time, allergy note...).
- **Your voice**: in owner settings, set how long replies are (short, medium or detailed), whether the assistant says prices, and a "house style" in your own words (tone, greetings, a line to mention). The ordering rules always come first.
- **Kitchen screen**: a stand-in for the POS while testing.
- **Pluggable AI**: Anthropic (default), OpenAI or OpenRouter, using the restaurant's own key.
- **Voice**: listening uses the browser's speech recognition (free) or ElevenLabs Scribe. Spoken replies come from Kokoro, a free open-source voice that runs on your own server (`TTS_PROVIDER=kokoro`), or from ElevenLabs Flash.

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
| Kiosk (portrait) | http://localhost:3000/kiosk |
| Kitchen screen | http://localhost:3000/kitchen |
| Owner settings | http://localhost:3000/admin |
| Embed example | http://localhost:3000/embed-demo |

The ordering screens are agent-only, so they need an API key to take orders; without one they show "assistant offline" (the kitchen screen and owner settings still work). Without an ElevenLabs key, the mic uses the browser's speech recognition (Chrome or Safari) and replies are text only. Restart `pnpm dev` after editing `.env`.

Locally, data is stored in an embedded Postgres (PGlite) under `.data/`. Delete that folder to reset.

## Database: Supabase

For a real restaurant, use [Supabase](https://supabase.com) (hosted Postgres with a free plan). It holds the owner's settings, in-progress orders and placed orders, so nothing is lost when the server restarts or redeploys.

1. Create a Supabase project and choose the region closest to the restaurant.
2. Open **Connect** and copy the **Session pooler** connection string. It works on IPv4 networks and suits a long-running server. Put your database password in it.
3. Download the CA certificate from **Project settings → Database → SSL configuration**.
4. In `.env`, set the connection string and the certificate's location:
   ```sh
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   DATABASE_SSL_CA=/path/to/prod-ca-2021.crt
   ```
5. Restart the server. It creates its tables on first start and logs `Postgres at …pooler.supabase.com (verified SSL)`.

Without `DATABASE_SSL_CA`, add `?sslmode=require` to the URL instead. The connection is still encrypted, but the server's identity isn't checked.

The tables turn on row-level security, so Supabase's public REST API can't read orders or settings. Only this server, which connects as the database owner, can. Any Postgres server works the same way via `DATABASE_URL`.

## Commands

```sh
pnpm test                         # unit tests, no API key needed
pnpm typecheck
pnpm menu                         # print the demo menu
pnpm --filter @foa/agent eval     # grade the real AI agent on both demo menus (needs a key)
pnpm --filter @foa/agent eval bubble-tea   # just one menu; EVAL_VERBOSE=1 prints every conversation
```

## Demo menus

Both are fictional; all names are original, and prices (AUD) and allergens are made up for testing. Pick one with `DEMO_MENU` in `.env` (`burger`, the default, or `bubble-tea`), then restart `pnpm dev`. The restaurant name comes from the menu until you save one in owner settings.

- **Patty & Co.** (`burger`): a burger shop laid out like a typical quick-service menu: meals, burgers, chicken, sides, drinks, coffee, desserts, a kids pack and breakfast (05:00–10:30). It covers defaults, required choices, choice limits, option prices, time-limited and sold-out items. Burgers link to their meal, so the agent offers the meal once (owner setting "Offer meals").
- **Bramble Tea** (`bubble-tea`): a bubble tea shop. Every drink needs size, sugar and ice with no defaults, so the agent asks for what's missing in one question; toppings are offered once.

How a menu tells the agent what to ask:

| Menu field | What the agent does |
|---|---|
| Group with `min` ≥ 1 and no default | Asks for it. Several missing groups are asked in one question, with buttons for each. |
| Group with a default | Uses the default unless the customer says otherwise. |
| Optional group (`min` 0) with `offer: true` | Offers it once after the item is added ("Any toppings?"). |
| Item with `mealItemId` | Offers the meal once when the item is ordered on its own. |
| Option `aliases` | Other ways customers say it ("half sugar" for "50% sugar"); they count as the exact words, so no "did you mean". |

`evals/demo-orders.json` and `evals/tea-orders.json` pair customer sentences and short conversations with the cart the agent should build.

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
