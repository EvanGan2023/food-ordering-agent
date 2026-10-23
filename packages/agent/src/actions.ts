import {
  addItem,
  checkAvailable,
  emptyCart,
  findItems,
  formatPrice,
  getGroup,
  getItem,
  normalizeAnswer,
  priceCart,
  removeItem,
  updateItem,
  type Answers,
  type Cart,
  type CartError,
  type ChoicePrompt,
  type Menu,
  type OrderQuestion,
  type Selections,
} from "@foa/core";

/** Everything the agent may change during a turn. The server loads it before and saves it after. */
export interface OrderState {
  cart: Cart;
  answers: Answers;
  pendingChoice: ChoicePrompt | null;
}

export const newOrderState = (): OrderState => ({ cart: emptyCart(), answers: {}, pendingChoice: null });

export interface ActionContext {
  menu: Menu;
  /** Owner questions for the current channel. */
  questions: OrderQuestion[];
  now: () => Date;
  state: OrderState;
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

function describeError(ctx: ActionContext, error: CartError) {
  if (error.code === "missing_choice") {
    const item = getItem(ctx.menu, error.itemId);
    ctx.state.pendingChoice = {
      itemId: error.itemId,
      itemName: item?.name ?? error.itemId,
      groupId: error.groupId,
      groupName: error.groupName,
      min: error.min,
      max: error.max,
      options: error.options,
    };
    return {
      ok: false,
      error: error.code,
      message: `Ask the customer to choose "${error.groupName}" (pick ${error.min}–${error.max}) for ${ctx.state.pendingChoice.itemName}, then call add_item again with all choices.`,
      options: error.options.map((o) => ({
        id: o.id,
        name: o.name,
        extra: o.priceDelta ? formatPrice(o.priceDelta, ctx.menu.currency) : undefined,
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

export function findItemsAction(ctx: ActionContext, query: string) {
  const now = ctx.now();
  return {
    results: findItems(ctx.menu, query, 6).map(({ item }) => ({
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

export function addItemAction(ctx: ActionContext, input: { item_id: string; qty?: number; choices?: ChoiceInput[] }) {
  const result = addItem(
    ctx.state.cart,
    ctx.menu,
    { itemId: input.item_id, qty: input.qty, modifiers: toSelections(input.choices) },
    ctx.now(),
  );
  if (!result.ok) return describeError(ctx, result.error);
  ctx.state.cart = result.value.cart;
  ctx.state.pendingChoice = null;
  return { ok: true, added_line_id: result.value.line.lineId, cart: cartSummary(ctx) };
}

export function updateItemAction(
  ctx: ActionContext,
  input: { line_id: string; qty?: number; choices?: ChoiceInput[] },
) {
  const result = updateItem(ctx.state.cart, ctx.menu, input.line_id, {
    qty: input.qty,
    modifiers: toSelections(input.choices),
  });
  if (!result.ok) return describeError(ctx, result.error);
  ctx.state.cart = result.value.cart;
  ctx.state.pendingChoice = null;
  return { ok: true, cart: cartSummary(ctx) };
}

export function removeItemAction(ctx: ActionContext, lineId: string) {
  const result = removeItem(ctx.state.cart, lineId);
  if (!result.ok) return describeError(ctx, result.error);
  ctx.state.cart = result.value.cart;
  return { ok: true, cart: cartSummary(ctx) };
}

export function clearCartAction(ctx: ActionContext) {
  ctx.state.cart = emptyCart();
  ctx.state.pendingChoice = null;
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
  const result = normalizeAnswer(question, input.answer);
  if (!result.ok) return { ok: false, error: "invalid_answer", message: result.reason };
  ctx.state.answers = { ...ctx.state.answers, [question.id]: result.value };
  return { ok: true, saved: result.value };
}
