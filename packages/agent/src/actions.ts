import {
  addItem,
  checkAvailable,
  choiceGroup,
  emptyCart,
  findItems,
  formatPrice,
  getGroup,
  getItem,
  isExactItem,
  normalizeAnswer,
  priceCart,
  rankItems,
  removeItem,
  saysPhrase,
  soundsLike,
  unnamedOptions,
  updateItem,
  type Answers,
  type Cart,
  type CartError,
  type CartLine,
  type ChoicePrompt,
  type Menu,
  type MenuItem,
  type OfferPrompt,
  type OrderQuestion,
  type Selections,
} from "@foa/core";

/** A change the agent guessed at (the customer didn't use the menu's words); held until they say yes. */
export type GuessedChange =
  | { kind: "add"; itemId: string; qty: number; choices: ChoiceInput[]; summary: string; replacesLineId?: string }
  | { kind: "update"; lineId: string; qty?: number; choices: ChoiceInput[]; summary: string };

export interface PendingConfirm {
  /** The turn the question was asked in; the answer has to come in a later turn. */
  askedTurn: number;
  changes: GuessedChange[];
}

/** An offer the agent made (the meal, or extras like toppings); it lapses after the customer's next message. */
export interface PendingOffer extends OfferPrompt {
  askedTurn: number;
}

/** Everything the agent may change during a turn. The server loads it before and saves it after. */
export interface OrderState {
  cart: Cart;
  answers: Answers;
  pendingChoice: ChoicePrompt | null;
  /** Counts customer messages, so a confirmation can't be answered in the turn that asked it. */
  turn?: number;
  pendingConfirm?: PendingConfirm | null;
  pendingOffers?: PendingOffer[];
}

export const newOrderState = (): OrderState => ({
  cart: emptyCart(),
  answers: {},
  pendingChoice: null,
  turn: 0,
  pendingConfirm: null,
  pendingOffers: [],
});

export interface ActionContext {
  menu: Menu;
  /** Owner questions for the current channel. */
  questions: OrderQuestion[];
  now: () => Date;
  state: OrderState;
  /** What the customer actually said: recent messages, the current one last. */
  customerSaid: string[];
  /** Offer the meal once when an item with a meal version is ordered on its own (owner setting). */
  offerMeals?: boolean;
}

/** The model sends choices as a list, which is easier for it than an object keyed by group id. */
export interface ChoiceInput {
  group_id: string;
  option_ids: string[];
}

const toSelections = (choices: ChoiceInput[] | undefined): Selections | undefined =>
  choices?.length ? Object.fromEntries(choices.map((c) => [c.group_id, c.option_ids])) : undefined;

export function cartSummary(ctx: ActionContext) {
  const priced = priceCart(ctx.state.cart, ctx.menu);
  return {
    lines: priced.lines.map((line) => ({
      line_id: line.lineId,
      qty: line.qty,
      item: line.name,
      options: line.options,
      line_total: formatPrice(line.lineTotal, priced.currency),
    })),
    subtotal: formatPrice(priced.subtotal, priced.currency),
  };
}

const price = (ctx: ActionContext, cents: number) => formatPrice(cents, ctx.menu.currency);

function describeError(ctx: ActionContext, error: CartError, replacesLineId?: string) {
  if (error.code === "missing_choice") {
    const item = getItem(ctx.menu, error.itemId);
    const itemName = item?.name ?? error.itemId;
    ctx.state.pendingChoice = { itemId: error.itemId, itemName, groups: error.groups, ...(replacesLineId ? { replacesLineId } : {}) };
    const names = error.groups.map((g) => `"${g.groupName}" (pick ${g.min}–${g.max})`);
    return {
      ok: false,
      error: error.code,
      message:
        error.groups.length > 1
          ? `Ask for ${names.join(", ")} for ${itemName} together in ONE short question (e.g. "What size, sugar and ice?"), then call add_item again with all choices.`
          : `Ask the customer to choose ${names[0]} for ${itemName}, then call add_item again with all choices.`,
      groups: error.groups.map((g) => ({
        group_id: g.groupId,
        name: g.groupName,
        options: g.options.map((o) => ({ id: o.id, name: o.name, extra: o.priceDelta ? price(ctx, o.priceDelta) : undefined })),
      })),
    };
  }
  if (error.code === "unavailable_now") {
    return {
      ok: false,
      error: error.code,
      message: `${error.name} is only available ${error.availability.start}–${error.availability.end}.`,
    };
  }
  return { ok: false, error: error.code, details: error };
}

/** Menu words in the customer's latest message that sound like something on the menu (misheard speech). */
export function heardAs(ctx: ActionContext) {
  return soundsLike(ctx.menu, ctx.customerSaid.at(-1) ?? "");
}

export function findItemsAction(ctx: ActionContext, query: string) {
  const now = ctx.now();
  // Word matches first, then items that sound or look like the query ("terror milk tea" → Taro Milk Tea).
  const byWords = findItems(ctx.menu, query, 6).map((hit) => hit.item);
  const bySound = rankItems(ctx.menu, query, 4).map((m) => m.item);
  const items = [...new Map([...byWords, ...bySound].map((item) => [item.id, item])).values()].slice(0, 8);
  return {
    results: items.map((item) => ({
      id: item.id,
      name: item.name,
      price: formatPrice(item.price, ctx.menu.currency),
      description: item.description || undefined,
      tags: item.tags,
      // Shown to the customer only as "the menu lists ..., please confirm with staff".
      allergens_from_menu: item.allergens,
      available_now: checkAvailable(ctx.menu, item, now) === null,
      choice_groups: item.modifierGroupIds.flatMap((groupId) => {
        const group = getGroup(ctx.menu, groupId);
        if (!group) return [];
        return [
          {
            id: group.id,
            name: group.name,
            min: group.min,
            max: group.max,
            options: group.options.map((o) => ({
              id: o.id,
              name: o.name,
              extra: o.priceDelta ? formatPrice(o.priceDelta, ctx.menu.currency) : undefined,
              default: o.default || undefined,
            })),
          },
        ];
      }),
    })),
  };
}

/**
 * The pieces of `said`. When the customer's words for one item are split up ("two X meals, one with a
 * cola and one with a shake"), the agent joins the pieces with "..." and each piece is checked.
 */
const pieces = (said: string) => said.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.trim());

/** True when every piece of `said` is in `message`, word for word. */
const saidIn = (message: string, said: string) => {
  const parts = pieces(said);
  return parts.length > 0 && parts.every((part) => saysPhrase(message, part));
};

/** `said` must be the customer's own words, copied from one of their recent messages. */
function quoted(ctx: ActionContext, said: string): boolean {
  return ctx.customerSaid.some((message) => saidIn(message, said));
}

const notQuoted = {
  ok: false,
  error: "said_not_quoted",
  message: "Nothing was changed. `said` must be the customer's words for this item, copied exactly from their message.",
};

/** Options the customer didn't name, judged on their words for this item plus their latest message. */
function guessedOptions(ctx: ActionContext, said: string, choices: ChoiceInput[] | undefined) {
  const latest = ctx.customerSaid.at(-1) ?? "";
  return unnamedOptions(ctx.menu, `${said} ${latest}`, toSelections(choices) ?? {});
}

/** How alike the quoted words may be to another item before they count as maybe meaning that item. */
const OTHER_ITEM_LIKENESS = 0.7;

/** Items the quoted words could mean other than `item`, leaving out names that are just its chosen options. */
function otherItems(ctx: ActionContext, item: MenuItem, said: string, choices: ChoiceInput[] | undefined) {
  const optionNames = chosenOptionNames(ctx, choices);
  return rankItems(ctx.menu, said, 5).filter(
    (m) => m.item.id !== item.id && ![m.item.name, ...m.item.aliases].some((phrase) => optionNames.some((name) => saysPhrase(name, phrase))),
  );
}

/**
 * The customer named this item exactly: in the quoted words, or, when an order describes several
 * lines of one item ("two X meals, one with a cola and one with a shake"), elsewhere in their latest
 * message while the quoted words don't look like any other item.
 */
function namedExactly(ctx: ActionContext, item: MenuItem, said: string, choices: ChoiceInput[] | undefined): boolean {
  if (isExactItem(ctx.menu, said, item)) return true;
  const latest = ctx.customerSaid.at(-1) ?? "";
  return (
    isExactItem(ctx.menu, latest, item) &&
    !otherItems(ctx, item, said, choices).some((m) => m.exact || m.score >= OTHER_ITEM_LIKENESS)
  );
}

/** Names and aliases of the options chosen in a tool call. */
function chosenOptionNames(ctx: ActionContext, choices: ChoiceInput[] | undefined): string[] {
  return (choices ?? []).flatMap((c) => {
    const group = getGroup(ctx.menu, c.group_id);
    return c.option_ids.flatMap((id) => {
      const option = group?.options.find((o) => o.id === id);
      return option ? [option.name, ...option.aliases] : [];
    });
  });
}

function describeChange(ctx: ActionContext, itemName: string, qty: number, choices: ChoiceInput[] | undefined): string {
  const optionNames = (choices ?? []).flatMap((c) => {
    const group = getGroup(ctx.menu, c.group_id);
    return c.option_ids.map((id) => group?.options.find((o) => o.id === id)?.name ?? id);
  });
  return `${qty > 1 ? `${qty} x ` : ""}${itemName}${optionNames.length ? ` (${optionNames.join(", ")})` : ""}`;
}

/** Holds a guessed change and tells the agent to ask. */
function holdForConfirmation(ctx: ActionContext, change: GuessedChange, why: string) {
  const turn = ctx.state.turn ?? 0;
  const pending = ctx.state.pendingConfirm;
  const changes = pending && pending.askedTurn === turn ? [...pending.changes, change] : [change];
  ctx.state.pendingConfirm = { askedTurn: turn, changes };
  return {
    ok: false,
    error: "confirm_needed",
    held: change.summary,
    message: `Nothing was added yet: ${why}. Ask the customer one short question to confirm (e.g. "Did you mean ${changes
      .map((c) => c.summary)
      .join(" and ")}?"). When they say yes, call confirm_changes with accept=true; if not, accept=false and do what they say.`,
  };
}

export function addItemAction(
  ctx: ActionContext,
  input: { item_id: string; said: string; qty?: number; choices?: ChoiceInput[] },
) {
  const item = getItem(ctx.menu, input.item_id);
  if (item && !quoted(ctx, input.said)) return notQuoted;
  // Earlier messages were already handled; their words only count when answering a question about that item.
  const latest = ctx.customerSaid.at(-1) ?? "";
  const answering = item && ctx.state.pendingChoice?.itemId === item.id ? ctx.state.pendingChoice : null;
  if (item && !saidIn(latest, input.said) && !answering) {
    return {
      ok: false,
      error: "already_handled",
      message: `Nothing was added. "${input.said}" is from an earlier message that was already handled; check get_cart. Only add what the customer asks for in their latest message.`,
    };
  }
  const qty = input.qty ?? 1;

  // Answering our question about an item they already chose: only the choices still need checking.
  if (item && !answering && !namedExactly(ctx, item, input.said, input.choices)) {
    // Another item named exactly means the agent picked the wrong one, unless that name is one of this
    // item's chosen options ("double stack meal with a lemonade": Lemonade is the meal's drink).
    const exactOther = otherItems(ctx, item, input.said, input.choices).find((m) => m.exact);
    if (exactOther) {
      return {
        ok: false,
        error: "not_what_they_said",
        message: `Nothing was added. The customer said "${exactOther.item.name}" (id ${exactOther.item.id}), not "${item.name}". Use the item they named.`,
      };
    }
    // Check the line is valid before asking about it; a missing choice is asked after they confirm.
    const trial = addItem(emptyCart(), ctx.menu, { itemId: item.id, qty, modifiers: toSelections(input.choices) }, ctx.now());
    if (!trial.ok && trial.error.code !== "missing_choice") return describeError(ctx, trial.error);
    // Offer one guess, or two when they're nearly tied, so the customer can answer yes or no.
    const [best, second] = rankItems(ctx.menu, input.said, 2);
    const close = [best, second && best && best.score - second.score < 0.05 ? second : undefined]
      .filter((m) => m !== undefined)
      .map((m) => m.item.name);
    return holdForConfirmation(
      ctx,
      { kind: "add", itemId: item.id, qty, choices: input.choices ?? [], summary: describeChange(ctx, item.name, qty, input.choices) },
      `the customer said "${input.said}", which isn't exactly a menu name${close.length ? ` (closest: ${close.join(", ")})` : ""}`,
    );
  }

  const replacesLineId = answering?.replacesLineId;
  if (item) {
    const guesses = guessedOptions(ctx, input.said, input.choices);
    if (guesses.length) {
      return holdForConfirmation(
        ctx,
        {
          kind: "add",
          itemId: item.id,
          qty,
          choices: input.choices ?? [],
          summary: describeChange(ctx, item.name, qty, input.choices),
          ...(replacesLineId ? { replacesLineId } : {}),
        },
        `the customer didn't say ${guesses.map((g) => `"${g.option.name}"`).join(" or ")}`,
      );
    }
  }

  return addNow(ctx, input.item_id, qty, input.choices, replacesLineId);
}

/** Adds a line, or swaps it in for `replacesLineId` (a burger made into a meal) in the same place. */
function addNow(ctx: ActionContext, itemId: string, qty: number, choices: ChoiceInput[] | undefined, replacesLineId?: string) {
  const result = addItem(ctx.state.cart, ctx.menu, { itemId, qty, modifiers: toSelections(choices) }, ctx.now());
  if (!result.ok) return describeError(ctx, result.error, replacesLineId);
  const { line } = result.value;
  let cart = result.value.cart;
  const replaced = replacesLineId ? cart.lines.find((l) => l.lineId === replacesLineId) : undefined;
  if (replaced) {
    cart = { lines: cart.lines.filter((l) => l !== line).map((l) => (l === replaced ? line : l)) };
    dropOffers(ctx, replaced.lineId);
  }
  ctx.state.cart = cart;
  ctx.state.pendingChoice = null;
  const offer = makeOffer(ctx, line, choices, !replaced);
  return {
    ok: true,
    added_line_id: line.lineId,
    ...(replaced ? { replaced_line_id: replaced.lineId } : {}),
    ...(offer ? { offer } : {}),
    cart: cartSummary(ctx),
  };
}

function dropOffers(ctx: ActionContext, lineId: string) {
  ctx.state.pendingOffers = (ctx.state.pendingOffers ?? []).filter((o) => o.lineId !== lineId);
}

/**
 * What to offer for a line just added: the meal version (when the owner allows it) and optional
 * groups the owner marked to offer, such as toppings, that the customer didn't mention.
 * Returns the instruction for the agent, or null when there's nothing to offer.
 */
function makeOffer(ctx: ActionContext, line: CartLine, choices: ChoiceInput[] | undefined, allowMeal: boolean): string | null {
  const item = getItem(ctx.menu, line.itemId);
  if (!item) return null;
  const named = new Set((choices ?? []).map((c) => c.group_id));
  const groups = item.modifierGroupIds
    .map((id) => getGroup(ctx.menu, id))
    .filter((g) => g !== undefined && g.offer && g.min === 0 && !named.has(g.id) && !line.modifiers[g.id]?.length)
    .map((g) => choiceGroup(g!));
  const mealItem = allowMeal && ctx.offerMeals && item.mealItemId ? getItem(ctx.menu, item.mealItemId) : undefined;
  const meal =
    mealItem && checkAvailable(ctx.menu, mealItem, ctx.now()) === null
      ? { itemId: mealItem.id, name: mealItem.name, extra: mealItem.price - item.price }
      : null;
  if (!meal && groups.length === 0) return null;

  dropOffers(ctx, line.lineId);
  ctx.state.pendingOffers = [
    ...(ctx.state.pendingOffers ?? []),
    { askedTurn: ctx.state.turn ?? 0, lineId: line.lineId, itemName: item.name, meal, groups },
  ];
  const asks = [
    ...(meal ? [`whether they'd like to make it a meal (+${price(ctx, meal.extra)}); if yes, call make_meal with line_id ${line.lineId}`] : []),
    ...groups.map(
      (g) =>
        `if they'd like any ${g.groupName.toLowerCase()} (e.g. ${g.options
          .slice(0, 4)
          .map((o) => o.name)
          .join(", ")}); if they name some, call update_item on ${line.lineId}`,
    ),
  ];
  return `In this reply, ask once and briefly ${asks.join("; and ")}. Ask about all offers in one sentence. If they decline or order something else, drop it.`;
}

export function updateItemAction(
  ctx: ActionContext,
  input: { line_id: string; said: string; qty?: number; choices?: ChoiceInput[] },
) {
  const line = ctx.state.cart.lines.find((l) => l.lineId === input.line_id);
  if (line && input.choices?.length) {
    if (!quoted(ctx, input.said)) return notQuoted;
    const guesses = guessedOptions(ctx, input.said, input.choices);
    if (guesses.length) {
      const name = getItem(ctx.menu, line.itemId)?.name ?? line.itemId;
      return holdForConfirmation(
        ctx,
        {
          kind: "update",
          lineId: line.lineId,
          qty: input.qty,
          choices: input.choices,
          summary: describeChange(ctx, name, input.qty ?? line.qty, input.choices),
        },
        `the customer didn't say ${guesses.map((g) => `"${g.option.name}"`).join(" or ")}`,
      );
    }
  }
  return updateNow(ctx, input.line_id, input.qty, input.choices);
}

function updateNow(ctx: ActionContext, lineId: string, qty: number | undefined, choices: ChoiceInput[] | undefined) {
  const result = updateItem(ctx.state.cart, ctx.menu, lineId, { qty, modifiers: toSelections(choices) });
  if (!result.ok) return describeError(ctx, result.error);
  ctx.state.cart = result.value.cart;
  ctx.state.pendingChoice = null;
  // Offered groups the customer has now chosen from are no longer on offer.
  const chosen = new Set((choices ?? []).map((c) => c.group_id));
  ctx.state.pendingOffers = (ctx.state.pendingOffers ?? [])
    .map((o) => (o.lineId === lineId ? { ...o, groups: o.groups.filter((g) => !chosen.has(g.groupId)) } : o))
    .filter((o) => o.meal || o.groups.length);
  return { ok: true, cart: cartSummary(ctx) };
}

/**
 * Swaps a line for its meal version after the customer accepted the meal offer (or asked for a meal).
 * Choices the item and meal share (e.g. "no pickles") carry over; a missing drink is asked next.
 */
export function makeMealAction(ctx: ActionContext, input: { line_id: string; said: string; choices?: ChoiceInput[] }) {
  const line = ctx.state.cart.lines.find((l) => l.lineId === input.line_id);
  if (!line) return { ok: false, error: "unknown_line" };
  const item = getItem(ctx.menu, line.itemId);
  const mealItem = item?.mealItemId ? getItem(ctx.menu, item.mealItemId) : undefined;
  if (!item || !mealItem) return { ok: false, error: "no_meal", message: `${item?.name ?? line.itemId} has no meal version.` };
  if (!quoted(ctx, input.said)) return notQuoted;

  const latest = ctx.customerSaid.at(-1) ?? "";
  const askedForMeal = saysPhrase(latest, "meal") || saysPhrase(latest, "combo");
  const offer = (ctx.state.pendingOffers ?? []).find((o) => o.lineId === line.lineId && o.meal);
  if (!askedForMeal && (!offer || offer.askedTurn >= (ctx.state.turn ?? 0))) {
    return {
      ok: false,
      error: offer ? "wait_for_answer" : "not_offered",
      message: "Nothing was changed. Make it a meal only after the customer says yes to the meal, or asks for one.",
    };
  }

  const given = input.choices ?? [];
  const carried = Object.entries(line.modifiers)
    .filter(([groupId]) => mealItem.modifierGroupIds.includes(groupId) && !given.some((c) => c.group_id === groupId))
    .map(([group_id, option_ids]) => ({ group_id, option_ids }));
  const choices = [...carried, ...given];
  dropOffers(ctx, line.lineId);

  const guesses = guessedOptions(ctx, input.said, given);
  if (guesses.length) {
    return holdForConfirmation(
      ctx,
      {
        kind: "add",
        itemId: mealItem.id,
        qty: line.qty,
        choices,
        summary: describeChange(ctx, mealItem.name, line.qty, choices),
        replacesLineId: line.lineId,
      },
      `the customer didn't say ${guesses.map((g) => `"${g.option.name}"`).join(" or ")}`,
    );
  }
  return addNow(ctx, mealItem.id, line.qty, choices, line.lineId);
}

/** After the customer's message is handled, offers from the previous reply lapse. */
export function finishTurn(state: OrderState) {
  state.pendingOffers = (state.pendingOffers ?? []).filter((o) => o.askedTurn >= (state.turn ?? 0));
}

/** Applies (or drops) the held guesses once the customer has answered in a later turn. */
export function confirmChangesAction(ctx: ActionContext, input: { accept: boolean }) {
  const pending = ctx.state.pendingConfirm;
  if (!pending) {
    return {
      ok: false,
      error: "nothing_to_confirm",
      message: "Nothing is waiting for a yes. Check get_cart; only ask the customer to confirm what a tool held (confirm_needed).",
    };
  }
  if ((ctx.state.turn ?? 0) <= pending.askedTurn) {
    return { ok: false, error: "wait_for_answer", message: "Ask the customer first; confirm only after they reply." };
  }
  ctx.state.pendingConfirm = null;
  if (!input.accept) return { ok: true, dropped: pending.changes.map((c) => c.summary), cart: cartSummary(ctx) };
  const results = pending.changes.map((change) =>
    change.kind === "add"
      ? { change: change.summary, ...addNow(ctx, change.itemId, change.qty, change.choices, change.replacesLineId) }
      : { change: change.summary, ...updateNow(ctx, change.lineId, change.qty, change.choices) },
  );
  return { ok: results.every((r) => r.ok), results, cart: cartSummary(ctx) };
}

export function removeItemAction(ctx: ActionContext, lineId: string) {
  const result = removeItem(ctx.state.cart, lineId);
  if (!result.ok) return describeError(ctx, result.error);
  ctx.state.cart = result.value.cart;
  dropOffers(ctx, lineId);
  return { ok: true, cart: cartSummary(ctx) };
}

export function clearCartAction(ctx: ActionContext) {
  ctx.state.cart = emptyCart();
  ctx.state.pendingChoice = null;
  ctx.state.pendingConfirm = null;
  ctx.state.pendingOffers = [];
  return { ok: true, cart: cartSummary(ctx) };
}

export function questionStatus(ctx: ActionContext) {
  return ctx.questions.map((q) => ({
    id: q.id,
    question: q.text,
    type: q.type,
    options: q.type === "choice" ? q.options : undefined,
    required: q.required,
    when: q.when,
    answer: ctx.state.answers[q.id] ?? null,
  }));
}

export function answerQuestionAction(ctx: ActionContext, input: { question_id: string; answer: string }) {
  const question = ctx.questions.find((q) => q.id === input.question_id);
  if (!question) return { ok: false, error: "unknown_question" };
  // Free-text answers (a name, a note) must be the customer's own words, never a placeholder.
  if (question.type === "text" && !ctx.customerSaid.some((message) => saysPhrase(message, input.answer))) {
    return {
      ok: false,
      error: "not_said",
      message: `Nothing was saved. "${input.answer}" isn't in what the customer said; ask them "${question.text}" and save their answer.`,
    };
  }
  const result = normalizeAnswer(question, input.answer);
  if (!result.ok) return { ok: false, error: "invalid_answer", message: result.reason };
  ctx.state.answers = { ...ctx.state.answers, [question.id]: result.value };
  return { ok: true, saved: result.value };
}
