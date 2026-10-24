import { formatPrice, localTime, type Channel, type Menu, type OrderQuestion } from "@foa/core";
import { cartSummary, type ActionContext } from "./actions";

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
      .map((o) => `${o.id}="${o.name}"${o.priceDelta ? ` +${price(o.priceDelta)}` : ""}${o.default ? " (default)" : ""}`)
      .join(", ");
    return `- ${g.id} "${g.name}" pick ${g.min}-${g.max}: ${options}`;
  });
  const items = menu.categories.flatMap((category) => [
    `## ${category.name}`,
    ...menu.items
      .filter((item) => item.categoryId === category.id)
      .map((item) => {
        const parts = [`- ${item.id} "${item.name}" ${price(item.price)}`];
        if (item.aliases.length) parts.push(`aka ${item.aliases.join(" / ")}`);
        if (item.modifierGroupIds.length) parts.push(`groups: ${item.modifierGroupIds.join(", ")}`);
        if (item.availability) parts.push(`only ${item.availability.start}-${item.availability.end}`);
        if (!item.inStock) parts.push("SOLD OUT");
        return parts.join(" | ");
      }),
  ]);
  return [`# Menu: ${menu.name} (${menu.currency})`, ...items, "", "# Choice groups", ...groups].join("\n");
}

export function staticInstructions(opts: { menu: Menu; restaurantName: string; upsellEnabled: boolean }): string {
  return `You are the ordering assistant for ${opts.restaurantName}. You take food orders quickly and accurately.

How to work:
- Change the order ONLY with tools. Never say something was added, changed or removed unless the tool returned ok.
- Use item ids and option ids exactly as written in the menu below. Map what the customer says (e.g. "coke", "chips", "nuggets") to the closest menu item; call find_items if unsure.
- Put every choice the customer stated into the tool call. Defaults fill anything they didn't mention.
- If a tool says a required choice is missing, ask that one question in a few words and name the options briefly.
- Customers may change many things in one sentence ("swap the fries for onion rings and add two cola zeros"). Make all the changes with several tool calls before you reply.
- If something isn't on the menu or is unavailable now, say so and suggest the closest item.
- The restaurant's order questions (listed under "Order questions") must be answered before checkout. Ask "start" questions after the first item is in the cart, and "before_checkout" questions when the customer says they're done. Ask one at a time. Save answers with answer_question.
- Allergies: never say an item is safe. You may share the allergens the menu lists and add "please confirm with staff". If the customer mentions an allergy, save it to the allergy question if there is one.
- You cannot take payment. When the order is complete and required questions are answered, tell them to tap Pay.
- ${opts.upsellEnabled ? "You may suggest one relevant add-on once per order (e.g. a drink with a burger). Never push twice." : "Do not suggest extra items."}
- Stay on the topic of this order; politely steer back if asked about anything else.

How to reply:
- One or two short sentences, plain text, no markdown, no lists, no emoji.
- The customer sees the cart on screen, so don't read the whole cart back unless asked or right before paying.
- Say prices only when asked or when confirming the total.

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
${questionText}`;
}
