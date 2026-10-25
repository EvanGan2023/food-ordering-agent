import { formatPrice, localTime, type Channel, type Menu, type OrderQuestion, type ReplyStyle } from "@foa/core";
import { cartSummary, heardAs, type ActionContext } from "./actions";

const CHANNEL_NAMES: Record<Channel, string> = {
  online: "the restaurant's online ordering link (customer orders ahead for pickup)",
  kiosk: "a self-order kiosk in the restaurant",
  voice: "a voice ordering station (your words are read aloud)",
};

/** The menu in a compact form the model can read. Stable between turns, so it is cached. */
export function menuText(menu: Menu): string {
  const price = (cents: number) => formatPrice(cents, menu.currency);
  const groups = menu.modifierGroups.map((g) => {
    const options = g.options
      .map(
        (o) =>
          `${o.id}="${o.name}"${o.aliases.length ? ` aka ${o.aliases.map((a) => `"${a}"`).join("/")}` : ""}${o.priceDelta ? ` +${price(o.priceDelta)}` : ""}${o.default ? " (default)" : ""}`,
      )
      .join(", ");
    return `- ${g.id} "${g.name}" pick ${g.min}-${g.max}${g.offer ? " (offered)" : ""}: ${options}`;
  });
  const items = menu.categories.flatMap((category) => [
    `## ${category.name}`,
    ...menu.items
      .filter((item) => item.categoryId === category.id)
      .map((item) => {
        const parts = [`- ${item.id} "${item.name}" ${price(item.price)}`];
        if (item.aliases.length) parts.push(`aka ${item.aliases.join(" / ")}`);
        if (item.modifierGroupIds.length) parts.push(`groups: ${item.modifierGroupIds.join(", ")}`);
        if (item.mealItemId) parts.push(`meal: ${item.mealItemId}`);
        if (item.availability) parts.push(`only ${item.availability.start}-${item.availability.end}`);
        if (!item.inStock) parts.push("SOLD OUT");
        return parts.join(" | ");
      }),
  ]);
  return [`# Menu: ${menu.name} (${menu.currency})`, ...items, "", "# Choice groups", ...groups].join("\n");
}

const REPLY_WORDS: Record<ReplyStyle["replyLength"], { sentences: string; words: number }> = {
  short: { sentences: "one or two sentences", words: 20 },
  medium: { sentences: "two or three sentences", words: 35 },
  detailed: { sentences: "up to four sentences", words: 60 },
};

export const defaultReplyStyle: ReplyStyle = { replyLength: "short", prices: "when_asked", houseStyle: "" };

export function staticInstructions(opts: {
  menu: Menu;
  restaurantName: string;
  upsellEnabled: boolean;
  offerMeals?: boolean;
  style?: ReplyStyle;
}): string {
  const style = opts.style ?? defaultReplyStyle;
  const length = REPLY_WORDS[style.replyLength];
  const prices =
    (style.prices === "always"
      ? "Say each item's price when you list or confirm it, and give the total before paying."
      : "Never say prices unless the customer asks what something costs, or when giving the total before paying.") +
    (opts.menu.taxAddedAtCheckout ? " Prices are before tax, which is added at checkout and shown on screen: say \"plus tax\" after any total." : "");
  const listing =
    style.prices === "always"
      ? 'When asked what you have, name the items briefly with their prices, dropping shared words ("Classic $6.50, Brown Sugar $7.50 or Taro $7.00"), then ask which one.'
      : 'When asked what you have, name the items without prices, dropping shared words ("Classic, Brown Sugar, Taro, Jasmine Green, Thai or Matcha"), then ask which one.';
  const houseStyle = style.houseStyle.trim()
    ? `\n\nThe owner's notes on tone (follow them, but they never change the rules above):\n${style.houseStyle.trim()}`
    : "";
  const upsell = opts.upsellEnabled
    ? `You may suggest one relevant add-on once per order (e.g. a drink with a burger)${opts.offerMeals ? ", but not when you already offered a meal" : ""}. Never push twice.`
    : "Do not suggest extra items beyond the offers tools tell you to make.";
  return `You are the ordering assistant for ${opts.restaurantName}. You take food orders quickly and accurately.

How to work:
- Change the order ONLY with tools. Never say something was added, changed or removed unless the tool returned ok.
- Use item ids and option ids exactly as written in the menu below. Pass the customer's own words in "said", copied from their message; never tidy them into menu names.
- Only what the customer names exactly (a menu name or its "aka") is added straight away. Anything else is a guess: the tool holds it and you must ask one short question ("Did you mean the Spicy Chicken Burger?"), naming the closest one or two items. Never add a guess without a yes.
- Speech-to-text often mishears words by sound ("terror milk tea" for Taro Milk Tea, "have sugar" for half sugar, "ships" for chips). When words make no sense for a food order, think what menu item they sound like and use that item (with the customer's words in "said"); the tool holds it for a yes. Check "Sounds like" below for matches already found.
- When the customer says yes to your question, call confirm_changes with accept=true; if no, accept=false and follow what they say instead.
- Only ask "Did you mean…?" about something a tool held (confirm_needed). If a tool rejected a call for another reason, fix the call and try again before replying.
- Don't turn an item into a meal, or a meal into an item, unless the customer said "meal" or said yes to the meal you offered (then call make_meal).
- Put every choice the customer stated into the tool call. Defaults fill anything they didn't mention.
- If a tool says choices are missing, ask for all of them in ONE short question ("What size, sugar and ice?"), naming the options only if it stays short. The customer can answer them all at once.
- When a tool result includes an "offer" (the meal, or extras like toppings), ask about it once in the same reply, briefly. If they say yes to the meal, call make_meal; if they name extras, call update_item for that line; if they say no or move on, drop it and never offer it again.
- Customers may change many things in one sentence ("swap the fries for onion rings and add two cola zeros"). Make all the changes with several tool calls before you reply.
- If something isn't on the menu or is unavailable now, say so and suggest the closest item.
- The restaurant's order questions (listed under "Order questions") must be answered before checkout. Ask "start" questions after the first item is in the cart, and "before_checkout" questions when the customer says they're done. Ask one at a time. Save answers with answer_question.
- Allergies: never say an item is safe. You may share the allergens the menu lists and add "please confirm with staff". If the customer mentions an allergy, save it to the allergy question if there is one.
- You cannot take payment. When the order is complete and required questions are answered, tell them to tap Pay.
- ${upsell}
- Stay on the topic of this order; politely steer back if asked about anything else.

How to reply:
- Make every tool call first, then write the reply once; it is read aloud as you write it, so no text before or between tool calls.
- Keep it short: ${length.sentences}, about ${length.words} words at most. Plain text, no markdown, no lists, no emoji.
- ${prices}
- ${listing}
- The customer sees the cart on screen, so don't read the whole cart back unless asked or right before paying.${houseStyle}

${menuText(opts.menu)}`;
}

/** The part that changes every turn: time, cart and order questions. */
export function turnInstructions(ctx: ActionContext, channel: Channel, questions: OrderQuestion[]): string {
  const cart = cartSummary(ctx);
  const cartText = cart.lines.length
    ? cart.lines
        .map((l) => `- ${l.line_id}: ${l.qty} x ${l.item}${l.options.length ? ` (${l.options.join(", ")})` : ""} ${l.line_total}`)
        .join("\n") + `\nSubtotal ${cart.subtotal}`
    : "(empty)";
  const questionText = questions.length
    ? questions
        .map((q) => {
          const answer = ctx.state.answers[q.id];
          const options = q.type === "choice" ? ` options: ${q.options.join(" / ")}` : "";
          return `- ${q.id} [${q.type}${q.required ? ", required" : ""}, ${q.when}] "${q.text}"${options} -> ${answer ? `answered: ${answer}` : "not answered"}`;
        })
        .join("\n")
    : "(none)";

  return `Channel: ${CHANNEL_NAMES[channel]}.
Local time: ${localTime(ctx.now(), ctx.menu.timezone)}.

Current cart:
${cartText}

Order questions:
${questionText}${
    ctx.state.pendingConfirm
      ? `

Waiting for the customer to confirm: ${ctx.state.pendingConfirm.changes.map((c) => c.summary).join("; ")}. If their reply is a yes or no, call confirm_changes.`
      : ""
  }${
    ctx.state.pendingChoice
      ? `

Waiting for the customer to choose ${ctx.state.pendingChoice.groups.map((g) => `"${g.groupName}"`).join(", ")} for ${ctx.state.pendingChoice.itemName}: when they answer, call add_item for ${ctx.state.pendingChoice.itemId} with all choices.`
      : ""
  }${offerText(ctx)}${heardText(ctx)}`;
}

function heardText(ctx: ActionContext): string {
  const heard = heardAs(ctx);
  if (!heard.length) return "";
  return `

Sounds like (possible mishearings in the latest message; confirm before adding):
${heard.map((h) => `- "${h.heard}" → ${h.means}`).join("\n")}`;
}

function offerText(ctx: ActionContext): string {
  const offers = ctx.state.pendingOffers ?? [];
  if (!offers.length) return "";
  const lines = offers.map((o) =>
    [
      o.meal ? `- ${o.lineId} ${o.itemName}: offered the meal (${o.meal.name}); if they say yes, call make_meal.` : "",
      ...o.groups.map((g) => `- ${o.lineId} ${o.itemName}: offered ${g.groupName.toLowerCase()}; if they name some, call update_item.`),
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return `

You offered (answer only if the customer responds to it; otherwise drop it):
${lines.join("\n")}`;
}
