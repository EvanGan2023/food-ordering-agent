# Food Ordering Agent

Open-source AI ordering agent for restaurants. Customers say or type what they want, the agent builds the order from the restaurant's real menu, asks only for missing choices, and sends the order to the POS.

Planned channels: an ordering link restaurants embed on their website, a "just say it" bar on kiosks, an iPad counter mode, and an open voice station that runs on the restaurant's own microphone and speaker.

> Status: early. This repo currently holds the menu and cart engine the agent will use, a demo menu, and the order test set.

## Quick start

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm test     # menu checks, cart rules and the demo order set
pnpm menu     # print the demo menu
```

## Demo menu: Patty & Co.

`packages/core/src/demo-menu.ts` is a fictional burger shop laid out like a typical quick-service menu: meals, burgers, chicken, sides, drinks, coffee, desserts, a kids pack and breakfast (05:00–10:30). All names are original. Prices (AUD) and allergens are made up for testing and are not real nutrition data.

It exercises the cases a real menu has:

- defaults (medium fries unless the customer says otherwise)
- required choices with no default, so the agent must ask (meal drink, sundae topping, dipping sauce)
- minimum and maximum choices (2–4 sauces on the share box)
- option prices (large meal +$1.00, oat milk +$0.70)
- time-limited items (breakfast) and sold-out items

## Order test set

`evals/demo-orders.json` pairs what a customer says with the cart the agent should build and its subtotal, plus cases where the agent must ask a follow-up. Today the tests check that every expected cart is valid and prices correctly; the same cases will grade the LLM agent.

## Layout

```
packages/core   menu schema, cart engine (add, update, remove, price, checkout), menu search, demo menu
evals           sample orders and expected carts
```

## Licence

[Apache-2.0](LICENSE)
