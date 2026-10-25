# DESIGN.md

How the customer screens look and behave, so new work matches what's already built. This describes the current code in `apps/web/src`. If you change the design, update this file in the same PR.

Product rules (agent-only screens, allergens, prices, portrait kiosk) live in `CLAUDE.md`. This file covers the visual and interaction layer on top of them.

## Principles

1. **The agent is the interface.** Each customer screen is an orb, the agent's words, the live order and a talk/type bar. There's no menu to browse. Taps are only for fixing order lines, answering the agent's choice buttons and owner questions, and paying.
2. **Read from across the counter.** The kiosk is read standing up, at arm's length, often in a noisy room. Use big type, big targets and one thing to do at a time.
3. **Warm and plain.** The look is cream paper, charcoal ink, pickle-green actions and a bun-orange accent, all in one typeface. It should feel like a friendly counter, not a dashboard.
4. **Calm motion that tells you something.** Every animation shows state: the orb's phase, a line arriving, the order number stamping. Every animation is turned off under `prefers-reduced-motion`.
5. **The voice leads, the text follows.** Replies show when the voice starts speaking, so the screen and the speaker never disagree.

## Tokens

All colours are Tailwind v4 theme tokens in `apps/web/src/app/globals.css` (`@theme`). Use the token class (`bg-pickle`, `text-char-soft`), never a hex value.

| Token        | Hex       | Use                                                                 |
| ------------ | --------- | ------------------------------------------------------------------- |
| `paper`      | `#f7f3ee` | Page background on every customer screen                            |
| `card`       | `#ffffff` | Cards, the voice bar, chips, inputs, dialogs                        |
| `char`       | `#2b211c` | Text; selected agent chips (`bg-char text-paper`); the Send button  |
| `char-soft`  | `#6b5e55` | Muted text: options, labels, hints, status, placeholders            |
| `line`       | `#e4dbd2` | Borders and dividers                                                |
| `pickle`     | `#2f5d3a` | Primary actions, the listening mic, focus ring, order number        |
| `pickle-dark`| `#234a2c` | Hover state for pickle                                              |
| `lettuce`    | `#e3eedc` | Status pills and option chips (paired with `text-pickle`)           |
| `bun`        | `#e3a35a` | Idle mic, "Tap to start", the orb's idle colour, needed-question bar |
| `bun-soft`   | `#f8e6cf` | Offline notice, needed-question highlight                           |
| `alert`      | `#a3321b` | Errors, Remove, kitchen allergy notes                               |
| `alert-soft` | `#fbe4dc` | Error notice background                                             |

Translucent charcoal is how you get quiet surfaces and borders: `border-char/15` and `border-char/20` (control borders), `bg-char/6` with hover `bg-char/12` (round side buttons), `hover:bg-char/5` (ghost). Shadows are charcoal at 6–7% opacity (see Elevation).

**Type**: Space Grotesk only (`--font-space`, loaded in `layout.tsx`). `font-display` and `font-sans` point to the same font, so don't use `font-display` expecting a different typeface.

**Money**: always `formatPrice(cents, currency)` from `@foa/core` (en-AU `Intl`), always with `tabular-nums`. Extras show as `+$0.80`. Totals read "Total (incl. $x tax)".

## Sizing and the kiosk scale

The kiosk is drawn in rem for a **1080×1920 portrait** screen at a 16px root. `html.kiosk-scale` (added by `KioskApp`) shrinks the root font size so the whole layout fits any screen. Landscape is drawn for 1280×800. So:

- On the kiosk, size everything in rem-based Tailwind units (`min-h-18`, `text-2xl`, `size-[22.5rem]`), never px.
- Every component takes a `kiosk` (or `size="kiosk"`) flag and switches to a larger set of classes. Keep the two sets side by side in one ternary, as the existing components do.

**Touch targets**

| Control                               | Regular       | Kiosk               |
| ------------------------------------- | ------------- | ------------------- |
| Floor (anything tappable)             | `min-h-11` (44px) | `min-h-14`      |
| Agent chips and choice buttons        | `min-h-12`    | `min-h-18`          |
| Order line fix buttons (− + Change Remove) | `min-h-11` | `min-h-16`         |
| Voice bar input, Send, side buttons   | `h-12` / `size-12` | `h-19` / `size-19` |
| Wide mic                              | `h-14 px-7`   | `h-22 min-w-80`     |
| Pay, "Tap to start"                   | `min-h-13`    | `h-24`              |

Keep gaps between targets at `gap-2` or more (`gap-3` on the kiosk).

## Type scale

| Role                         | Regular                                  | Kiosk                                    |
| ---------------------------- | ---------------------------------------- | ---------------------------------------- |
| Welcome headline             | n/a                                      | `text-[4.75rem] leading-[1.04] font-bold tracking-tight` (landscape `text-[3.5rem]`) |
| Agent caption                | `text-2xl sm:text-3xl leading-snug font-medium tracking-tight` | `text-[3.1rem] leading-[1.18] font-medium tracking-tight` |
| Customer's words (in quotes) | `text-lg leading-snug text-char-soft`    | `text-3xl leading-snug text-char-soft`   |
| Status label                 | `text-sm uppercase tracking-[0.16em] text-char-soft` | `text-xl …`                  |
| Card heading ("Your order")  | `text-xl font-semibold`                  | `text-3xl font-semibold`                 |
| Line item / body             | `text-base`                              | `text-2xl` (options `text-xl`)           |
| Total                        | `text-2xl font-bold tracking-tight tabular-nums` | `text-4xl …`                     |
| Order number                 | `text-[6.5rem] font-extrabold tracking-tighter tabular-nums text-pickle` | `text-[9rem] …` |

Weights: **customer agent UI uses `font-medium` and `font-semibold`.** `font-bold` is for totals and the welcome headline, and `font-extrabold` only for the order number. Owner settings and the kitchen use bolder weights (see Other screens).

Sentence case everywhere. The status label is the only uppercase text, set with the `uppercase` class.

## Shape and elevation

- **Radii**:
  - `rounded-full`: all buttons, chips, inputs, the voice bar, toasts.
  - `rounded-[2rem]`: the order card.
  - `rounded-[1.25rem]`: order lines.
  - `rounded-3xl`: dialogs and panels.
  - `rounded-2xl`: notices and the phone summary bar.
- **Borders**: agent controls use `border-[1.5px]`, cards use `border border-line`.
- **Elevation**: soft charcoal shadows only.
  - Order card `shadow-[0_4px_24px_rgb(43_33_28/0.06)]`.
  - Voice bar `shadow-[0_4px_16px_rgb(43_33_28/0.07)]`.
  - Phone summary bar `shadow-[0_2px_10px_rgb(43_33_28/0.06)]`.
  - Dialogs `shadow-2xl`.
  - Nothing else floats.
- **Docket**: `.docket` is a printed slip with a torn bottom edge, separated by `.docket-rule` dashed lines. Use it only for things that are a ticket or receipt: the order confirmation and kitchen tickets.

## The orb (`AuraOrb`, `.aura` in globals.css)

One element with four layers (`aura-ring-outer`, `aura-ring`, `aura-core`, `aura-swirl`), coloured and animated by a phase class. The phase comes only from `useAgentInput` (`lib/use-agent-input.ts`). Don't set it anywhere else.

| Phase       | Status label        | Look                                   | Motion                       |
| ----------- | ------------------- | -------------------------------------- | ---------------------------- |
| `idle`      | Ready               | Bun-orange core                        | Slow breathe, 5s             |
| `listening` | Listening           | Lettuce-to-pickle green core           | Pulse 1.1s, ring ripple      |
| `thinking`  | Building your order | Pale paper core, swirl visible         | Swirl spins 1.4s             |
| `speaking`  | Speaking            | Bun core                               | Talk bob 0.62s, slow ripple  |
| `offline`   | Assistant offline   | Bun core at 55% opacity                | Still                        |

Offline keeps the brand orb, still and faded, so the screen looks paused, not broken.

**Sizes**: the orb shrinks as the order grows, which gives room to the order and the choices.

| State                    | Kiosk portrait | Kiosk landscape | Ordering link            |
| ------------------------ | -------------- | --------------- | ------------------------ |
| Welcome                  | `size-[30rem]` | `size-[16rem]`  | n/a                      |
| Empty order              | `size-[22.5rem]` | `size-[14rem]` | `size-[min(30vh,280px)]` |
| Has lines / choice showing | `size-[15rem]` | `size-[10rem]` | `size-[min(22vh,200px)]`, choice `min(16vh,160px)` |
| Phone with order open    | n/a            | n/a             | hidden (`compact`)       |

## Screen layouts

### Kiosk (`app/kiosk/KioskApp.tsx`), portrait first

```
┌─────────────────────────────┐
│ Brand            Start over │  header px-10 pt-10
│                             │
│            (orb)            │  AgentStage: status, orb,
│          READY              │  caption, choice buttons
│  "Hi! What can I get you?"  │
│     [chip] [chip] [chip]    │
│                             │
│   [⌨]  [ 🎙 Tap to talk ]    │  VoiceBar (talk mode first)
│ ┌─────────────────────────┐ │
│ │ Your order       2 items│ │  OrderCard, max 46% height
│ │ 1× Classic …     $8.30  │ │
│ │ Order details …         │ │
│ │ Total     [ Pay $8.30 ] │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- **Welcome**: the whole screen is one button. It shows the orb, "Just say what you'd like.", a subline and a pulsing bun "Tap to start" pill. Tapping it also starts the mic.
- **Landscape**: the order card moves to a right column `w-[35rem]`.
- **Confirmation**: the `.docket` receipt with the stamped number, "We'll call your number at the counter when it's ready.", "Start new order", and an auto reset after 20s.
- **Header actions**: "Start over" (hidden on the welcome screen) and "Have a pickup code?".

### Ordering link (`app/order/[slug]/OrderApp.tsx`), phone first

- The header shows Brand and "Order ahead". In embed mode (`?embed=1`) it's tighter and leaves room for the close button.
- AgentStage on top. Once the order has lines, a summary bar ("Your order · N items · $total · View") opens the full order card in place.
- The VoiceBar starts in **type mode** (input plus a round mic). It sits on the safe-area inset.
- Desktop (`lg`): the order card is a fixed right column `w-[400px]`.
- Actions: "Pay now (demo)" (primary) and "Pay at pickup".

### Embed (`public/embed.js`)

A floating pickle "Order online" pill and a 400×640 iframe panel. It goes full screen at ≤480px, and Esc closes it. It's plain JS on someone else's site, so it hard-codes the token hex values. Keep them in sync with `globals.css`.

## Components

Copy these patterns. Don't invent a new style for a new control.

### Buttons and chips (customer agent UI)

```ts
// Primary (agent): Done, Add, "Yes, add it", Pay
`rounded-full bg-pickle font-semibold text-white hover:bg-pickle-dark disabled:opacity-45 ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`
// Plain (agent): No, No thanks
`rounded-full border-[1.5px] border-char/20 bg-card font-semibold hover:border-char ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`
// Chip: one option; selected chips go charcoal
`rounded-full border-[1.5px] font-medium transition-colors ${selected ? "border-char bg-char text-paper" : "border-char/20 bg-card hover:border-char"} ${kiosk ? "min-h-18 px-8 text-2xl" : "min-h-12 px-5 text-base"}`
```

- Chip rows are `flex max-w-[58rem] flex-wrap justify-center gap-3`.
- A price extra sits after the label in `text-char-soft` (`text-paper/70` when selected).
- One pick-one group sends on tap. Several groups need "Done".
- The agent's buttons hide while the agent is listening, thinking or busy.

`buttonClass` in `components/ui.tsx` (primary, secondary, ghost, danger; regular or kiosk) is for **page chrome**: header actions, dialogs, confirmation, settings. Use it there, and use the agent patterns above inside the agent stage and the order card.

### Voice bar (`components/agent/VoiceBar.tsx`)

- A white pill `rounded-full border border-line bg-card` with the voice-bar shadow.
- **Mic**: bun when idle (`bg-bun text-char`), pickle when listening (`bg-pickle text-white`, `aria-pressed`). It's disabled while transcribing or offline. Wide labels: "Tap to talk", "Tap when done", "One moment…".
- **Side buttons** (keyboard, speaker, "Talk instead"): round `bg-char/6 hover:bg-char/12`.
- **Send**: charcoal `bg-char text-paper`, shown only when there's text.
- The placeholder changes with state: "Say or type your order…", "Add or change something…", "Listening…".

### Order card (`components/agent/OrderCard.tsx`)

- **Card**: `rounded-[2rem] border border-line bg-card`, `p-5` (`p-8` on the kiosk), with the order-card shadow.
- **Line**: `line-in rounded-[1.25rem]` on a slightly warm fill. Top row: `2×` · name · options joined with " · " · price, then a chevron. Tapping the line opens its fix controls: − / + / Change options / Remove. Remove is `text-alert`, borderless and pushed right.
- **Empty state**: "Items appear here as you talk. Tap any line to change it."
- **Owner questions** (`QuestionsPanel`) sit inside the card. A needed question gets the bun left bar (`border-l-4 border-bun bg-bun-soft/60`). Required questions block Pay, and the blocker reads "Answer the order details first: …".
- **Pay**: full width, `h-24 text-3xl` on the kiosk, labelled with the total ("Pay $23.40"). While blocked it's a muted fill, not a hidden button.

### Notices and hints (`AgentStage`)

- A notice is a rounded-2xl strip under the caption: offline `bg-bun-soft`, error `bg-alert-soft text-alert`, with a dismiss ✕.
- Mic and voice hints are `text-char-soft` with `role="status"`. They show only when there's no notice.

### Dialogs

- A native `<dialog>`: `rounded-3xl bg-card shadow-2xl` over a `rgb(43 33 28 / 0.55)` backdrop.
- A header with the title and a ✕ close, then a scrolling body.
- Kiosk dialogs use `max-w-3xl`, others `max-w-lg`.

## Motion

| Class         | Where                         | Feel                                       |
| ------------- | ----------------------------- | ------------------------------------------ |
| `.aura.*`     | Orb                           | Phase loops (see above)                    |
| `.line-in`    | New order lines, summary bar  | 420ms rise and fade with a slight overshoot |
| `.stamp-in`   | Order number                  | 420ms rubber-stamp scale and rotate        |
| `.soft-pulse` | "Tap to start"                | 2.4s opacity breathe                       |

- Put new keyframes in the `prefers-reduced-motion: no-preference` block in `globals.css`.
- Size changes ease over 450ms.
- Colour changes take 400–600ms.

## Voice and text sync

These behaviours are part of the design, not implementation details:

- While the voice is on, a streamed reply's text stays hidden until the voice starts (or for at most 1.5s). Meanwhile the orb shows `thinking` and the caption shows the customer's last words in quotes.
- Replies are spoken one sentence at a time. The first chunk breaks at the first comma or full stop, so speech starts fast.
- Typing, tapping or starting the mic stops the voice right away. The customer can always interrupt.
- If the voice fails, it turns off and says so: "Voice replies stopped working, so they're turned off. Replies still show as text."

## Writing

- Use sentence case, talk to the customer as "you", use contractions, keep it short. "We'll call your number at the counter when it's ready."
- Errors say what to do next: "Didn't hear anything. Tap the mic and try again, or type instead." Customer error copy is kept in one place, `describeError` in `lib/api.ts`. Add new error copy there.
- Use the single-character ellipsis "…", the minus sign "−" (U+2212) and the close glyph "✕".
- List separators: " · " inside a line on screen, ", " on dockets (receipt and kitchen).
- Demo honesty: anything fake says so ("Pay now (demo)", "Demo POS stand-in").
- Allergens: show only what the menu lists, and always add "please confirm with staff" (see `CLAUDE.md`).

## Accessibility

- Focus ring: `3px solid pickle`, offset 2px (global `:focus-visible`). Don't remove it.
- The caption log is `role="log" aria-live="polite"`. The orb is `aria-hidden` because the status label says the same thing in words.
- Toggle buttons such as the mic and chips use `aria-pressed`.
- Contrast: `char-soft` on `paper` or `card` is the lowest you can go for text. Don't lighten muted text further.

## Other screens

These aren't customer screens, and they have their own established look:

- **Kitchen** (`app/kitchen/KitchenBoard.tsx`): the only dark screen. It's `bg-char text-white` with `white/5` columns and `.docket` tickets. Weights are bold to extrabold so it reads from across a hot kitchen. Allergy notes get `border-2 border-alert bg-alert-soft text-alert`.
- **Owner settings** (`app/admin/AdminSettings.tsx`): a plain form layout. `max-w-3xl` column, section cards `rounded-3xl border-2 border-line bg-card p-5`, `rounded-xl` fields, `buttonClass` buttons, a pickle toggle, a sticky Save and a toast.

## Known drift (fix when you touch the file)

The code doesn't fully follow this doc yet. When you edit one of these spots, bring it in line:

| Where | Now | Target |
| ----- | --- | ------ |
| `VoiceBar.tsx` mic hover | `hover:bg-[#d9944a]` | Add a `bun-dark` token and use it |
| `OrderCard.tsx` line and footer | `border-[#efe7de] bg-[#fbf8f4]` | Add `line-soft` and `paper-soft` tokens |
| `OrderCard.tsx` blocked Pay | `bg-[#f1ebe4]` | Use a token (e.g. `bg-line`) or the `disabled:` pattern |
| `QuestionsPanel.tsx` | `border-2`, `font-bold`, pickle selected chips, `font-display font-extrabold` heading | Match the agent chips (`border-[1.5px]`, `font-medium`, charcoal selected) since it sits inside the order card |
| `OptionsDialog.tsx` selected rows | `has-[:checked]:bg-lettuce` (pickle) | Charcoal selected state, like the chips |
| `OptionsDialog.tsx:90` allergens | "Contains: …" only | Add "please confirm with staff" |
| `OptionsDialog.tsx:174` minus | "–" en dash | "−" U+2212 |
| Disabled opacity | 40 / 45 / 50 in different files | `disabled:opacity-45` everywhere |
| `AgentStage.tsx` notice dismiss, QuestionsPanel "Change" | `size-9`, `min-h-10!` on the kiosk | At least `min-h-14` on the kiosk |
| `AdminSettings.tsx:91` name input | Missing `bg-card` | Use the shared `field` class |
| `OrderApp.tsx` desktop card | `w-[400px]` | `w-[25rem]` |

## Checklist for UI changes

- [ ] Colours come from tokens. No new hex values.
- [ ] The component has a `kiosk` variant, and kiosk targets are at least `min-h-14`.
- [ ] Checked at 1080×1920 (kiosk portrait), 1280×800 (kiosk landscape) and 390×844 (phone).
- [ ] No browsable menu. Taps only fix lines, answer the agent's choice buttons or owner questions, or pay.
- [ ] Motion is inside the reduced-motion block and tells the customer something.
- [ ] The copy is sentence case, says what to do next, and puts error text in `describeError`.
- [ ] Allergen text comes from the menu and includes "please confirm with staff".
- [ ] This file is updated if the pattern changed.
