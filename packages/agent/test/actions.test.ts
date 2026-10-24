import { describe, expect, it } from "vitest";
import { defaultQuestions, demoMenu, questionsFor, teaMenu, type Menu } from "@foa/core";
import {
  addItemAction,
  answerQuestionAction,
  clearCartAction,
  confirmChangesAction,
  findItemsAction,
  finishTurn,
  makeMealAction,
  newOrderState,
  removeItemAction,
  updateItemAction,
  type ActionContext,
} from "../src";

const AFTERNOON = new Date("2026-07-15T04:00:00Z");

const context = (...customerSaid: string[]): ActionContext => ({
  menu: demoMenu,
  questions: questionsFor(defaultQuestions, "online"),
  now: () => AFTERNOON,
  state: { ...newOrderState(), turn: 1 },
  customerSaid,
});

const withMenu = (menu: Menu, ctx: ActionContext, extra: Partial<ActionContext> = {}): ActionContext => ({ ...ctx, menu, ...extra });

/** The customer's next message: a new turn. */
function reply(ctx: ActionContext, text: string) {
  ctx.state.turn = (ctx.state.turn ?? 0) + 1;
  ctx.customerSaid = [...ctx.customerSaid, text];
}

describe("order actions", () => {
  it("adds items with the customer's choices and returns the cart", () => {
    const ctx = context("Two cheeseburgers, no pickles please");
    const result = addItemAction(ctx, {
      item_id: "cheeseburger",
      said: "Two cheeseburgers, no pickles",
      qty: 2,
      choices: [{ group_id: "hold-classic", option_ids: ["no-pickles"] }],
    });
    expect(result).toMatchObject({ ok: true, added_line_id: "l1" });
    expect(ctx.state.cart.lines[0]).toMatchObject({ itemId: "cheeseburger", qty: 2 });
  });

  it("records a pending choice when a required option is missing", () => {
    const ctx = context("a double stack meal");
    const result = addItemAction(ctx, { item_id: "double-stack-meal", said: "double stack meal" });
    expect(result).toMatchObject({ ok: false, error: "missing_choice" });
    expect(ctx.state.pendingChoice).toMatchObject({ groups: [{ groupId: "meal-drink" }], itemName: "Double Stack Meal" });
    expect(ctx.state.cart.lines).toHaveLength(0);

    // Answering the drink question names only the drink; the item's words come from the earlier message.
    reply(ctx, "Lemonade");
    addItemAction(ctx, {
      item_id: "double-stack-meal",
      said: "double stack meal",
      choices: [{ group_id: "meal-drink", option_ids: ["lemonade"] }],
    });
    expect(ctx.state.pendingChoice).toBeNull();
    expect(ctx.state.cart.lines).toHaveLength(1);
  });

  it("handles a multi-part amendment", () => {
    const ctx = context("A cheeseburger meal with a cola and fries");
    addItemAction(ctx, { item_id: "cheeseburger-meal", said: "cheeseburger meal with a cola", choices: [{ group_id: "meal-drink", option_ids: ["cola"] }] });
    addItemAction(ctx, { item_id: "fries", said: "fries" });
    reply(ctx, "Make the meal large, swap the fries for onion rings and add two cola zeros");
    updateItemAction(ctx, { line_id: "l1", said: "Make the meal large", choices: [{ group_id: "meal-size", option_ids: ["large"] }] });
    removeItemAction(ctx, "l2");
    addItemAction(ctx, { item_id: "onion-rings", said: "onion rings" });
    addItemAction(ctx, { item_id: "cola-zero", said: "two cola zeros", qty: 2 });
    expect(ctx.state.cart.lines.map((l) => [l.itemId, l.qty])).toEqual([
      ["cheeseburger-meal", 1],
      ["onion-rings", 1],
      ["cola-zero", 2],
    ]);
    expect(ctx.state.cart.lines[0]?.modifiers["meal-size"]).toEqual(["large"]);
  });

  it("starts over", () => {
    const ctx = context("fries");
    addItemAction(ctx, { item_id: "fries", said: "fries" });
    clearCartAction(ctx);
    expect(ctx.state.cart.lines).toEqual([]);
  });

  it("finds items with allergens from menu data only", () => {
    const [first] = findItemsAction(context(), "cheeseburger").results;
    expect(first).toMatchObject({ id: "cheeseburger", allergens_from_menu: ["gluten", "sesame", "milk", "mustard"] });
  });

  it("validates answers to owner questions", () => {
    const ctx = context();
    expect(answerQuestionAction(ctx, { question_id: "dine-in", answer: "takeaway" })).toEqual({ ok: true, saved: "Takeaway" });
    expect(answerQuestionAction(ctx, { question_id: "pickup-time", answer: "as soon as possible" })).toEqual({
      ok: true,
      saved: "ASAP",
    });
    expect(answerQuestionAction(ctx, { question_id: "dine-in", answer: "delivery" })).toMatchObject({
      ok: false,
      error: "invalid_answer",
    });
    expect(answerQuestionAction(ctx, { question_id: "nope", answer: "x" })).toMatchObject({ ok: false });
    expect(ctx.state.answers).toEqual({ "dine-in": "Takeaway", "pickup-time": "ASAP" });
  });
});

describe("only the customer's exact words go straight into the order", () => {
  it("holds a misheard item until the customer says yes in a later turn", () => {
    const ctx = context("a spicy chikken burger");
    const held = addItemAction(ctx, { item_id: "spicy-chicken-burger", said: "spicy chikken burger" });
    expect(held).toMatchObject({ ok: false, error: "confirm_needed", held: "Spicy Chicken Burger" });
    expect(ctx.state.cart.lines).toEqual([]);

    // The agent can't confirm on the customer's behalf in the same turn.
    expect(confirmChangesAction(ctx, { accept: true })).toMatchObject({ ok: false, error: "wait_for_answer" });

    reply(ctx, "yes");
    expect(confirmChangesAction(ctx, { accept: true })).toMatchObject({ ok: true });
    expect(ctx.state.cart.lines.map((l) => l.itemId)).toEqual(["spicy-chicken-burger"]);
    expect(ctx.state.pendingConfirm).toBeNull();
  });

  it("drops the guess when the customer says no", () => {
    const ctx = context("a cheese burgr");
    addItemAction(ctx, { item_id: "cheeseburger", said: "cheese burgr" });
    reply(ctx, "no, a classic burger");
    expect(confirmChangesAction(ctx, { accept: false })).toMatchObject({ ok: true, dropped: ["Cheeseburger"] });
    expect(ctx.state.cart.lines).toEqual([]);
  });

  it("points the agent at the item the customer actually named", () => {
    // Said "Big Cheese Deluxe", not the meal.
    const ctx = context("Big Cheese Deluxe with no onion and no pickles, and a water");
    const result = addItemAction(ctx, { item_id: "big-cheese-deluxe-meal", said: "Big Cheese Deluxe with no onion and no pickles" });
    expect(result).toMatchObject({ ok: false, error: "not_what_they_said" });
    expect(JSON.stringify(result)).toContain("big-cheese-deluxe");
    expect(ctx.state.cart.lines).toEqual([]);
  });

  it("holds options the customer didn't name", () => {
    const ctx = context("a cheeseburger meal with a coke");
    const result = addItemAction(ctx, {
      item_id: "cheeseburger-meal",
      said: "cheeseburger meal with a coke",
      choices: [{ group_id: "meal-drink", option_ids: ["cola-zero"] }],
    });
    expect(result).toMatchObject({ ok: false, error: "confirm_needed" });
    expect(ctx.state.pendingConfirm?.changes[0]?.summary).toBe("Cheeseburger Meal (Cola Zero)");
  });

  it("rejects words the customer never said", () => {
    const ctx = context("a cheese burgr");
    expect(addItemAction(ctx, { item_id: "cheeseburger", said: "cheeseburger" })).toMatchObject({ error: "said_not_quoted" });
    expect(ctx.state.cart.lines).toEqual([]);
  });

  it("holds a guessed option change on an existing line", () => {
    const ctx = context("a cheeseburger meal with a cola");
    addItemAction(ctx, { item_id: "cheeseburger-meal", said: "cheeseburger meal with a cola", choices: [{ group_id: "meal-drink", option_ids: ["cola"] }] });
    reply(ctx, "make it a diet one");
    const result = updateItemAction(ctx, { line_id: "l1", said: "make it a diet one", choices: [{ group_id: "meal-drink", option_ids: ["cola-zero"] }] });
    expect(result).toMatchObject({ ok: false, error: "confirm_needed" });
    expect(ctx.state.cart.lines[0]?.modifiers["meal-drink"]).toEqual(["cola"]);
    reply(ctx, "yes please");
    confirmChangesAction(ctx, { accept: true });
    expect(ctx.state.cart.lines[0]?.modifiers["meal-drink"]).toEqual(["cola-zero"]);
  });

  it("won't add an item again from an earlier, already-handled message", () => {
    const ctx = context("A cheese burgr and chips");
    addItemAction(ctx, { item_id: "fries", said: "chips" });
    addItemAction(ctx, { item_id: "cheeseburger", said: "A cheese burgr" });
    reply(ctx, "Yes please");
    confirmChangesAction(ctx, { accept: true });
    expect(addItemAction(ctx, { item_id: "fries", said: "chips" })).toMatchObject({ ok: false, error: "already_handled" });
    expect(ctx.state.cart.lines.map((l) => l.itemId)).toEqual(["fries", "cheeseburger"]);
  });
});

describe("order question answers", () => {
  it("saves a name only if the customer said it", () => {
    const ctx = context("can I please add pearls");
    expect(answerQuestionAction(ctx, { question_id: "name", answer: "pending" })).toMatchObject({ ok: false, error: "not_said" });
    expect(ctx.state.answers.name).toBeUndefined();
    reply(ctx, "It's Evan");
    expect(answerQuestionAction(ctx, { question_id: "name", answer: "Evan" })).toMatchObject({ ok: true, saved: "Evan" });
  });
});

describe("split quotes", () => {
  it("accepts the customer's words in pieces, each copied from their message", () => {
    const ctx = context("Two Smoky Bacon Deluxe meals, both large, one with a cola and one with a chocolate thickshake");
    const result = addItemAction(ctx, {
      item_id: "smoky-bacon-deluxe-meal",
      said: "Smoky Bacon Deluxe meals, both large ... one with a chocolate thickshake",
      choices: [
        { group_id: "meal-size", option_ids: ["large"] },
        { group_id: "meal-drink", option_ids: ["choc-shake"] },
      ],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("accepts the second line of an item named once for both", () => {
    const ctx = context("Two Smoky Bacon Deluxe meals, both large, one with a cola and one with a chocolate thickshake");
    const result = addItemAction(ctx, {
      item_id: "smoky-bacon-deluxe-meal",
      said: "one with a chocolate thickshake",
      choices: [
        { group_id: "meal-size", option_ids: ["large"] },
        { group_id: "meal-drink", option_ids: ["choc-shake"] },
      ],
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("still holds words that look like a different item, even if this one was named too", () => {
    const ctx = context("A cheeseburger and a dubble cheese burger");
    expect(addItemAction(ctx, { item_id: "cheeseburger", said: "a dubble cheese burger" })).toMatchObject({ error: "confirm_needed" });
  });

  it("rejects a piece the customer never said", () => {
    const ctx = context("Two Smoky Bacon Deluxe meals, both large, one with a cola");
    expect(addItemAction(ctx, { item_id: "smoky-bacon-deluxe-meal", said: "Smoky Bacon Deluxe meals ... with a lemonade" })).toMatchObject({
      error: "said_not_quoted",
    });
  });
});

describe("misheard items", () => {
  it("holds a misheard meal even when its drink is also an item on the menu", () => {
    const ctx = context("A double stuck meal with a lemonade");
    const result = addItemAction(ctx, {
      item_id: "double-stack-meal",
      said: "A double stuck meal with a lemonade",
      choices: [{ group_id: "meal-drink", option_ids: ["lemonade"] }],
    });
    expect(result).toMatchObject({ ok: false, error: "confirm_needed" });
  });

  it("still catches a different item the customer named exactly", () => {
    const ctx = context("A lemonade");
    expect(addItemAction(ctx, { item_id: "orange-soda", said: "A lemonade" })).toMatchObject({ error: "not_what_they_said" });
  });
});

describe("bubble tea: several choices and offered toppings", () => {
  const SIZE_SUGAR_ICE = [
    { group_id: "tea-size", option_ids: ["large"] },
    { group_id: "sugar", option_ids: ["50"] },
    { group_id: "ice", option_ids: ["less"] },
  ];

  it("asks size, sugar and ice in one question, then offers toppings", () => {
    const ctx = withMenu(teaMenu, context("A taro milk tea please"));
    const asked = addItemAction(ctx, { item_id: "taro-milk-tea", said: "A taro milk tea" });
    expect(asked).toMatchObject({ ok: false, error: "missing_choice" });
    expect("message" in asked && asked.message).toContain("ONE short question");
    expect(ctx.state.pendingChoice?.groups.map((g) => g.groupId)).toEqual(["tea-size", "sugar", "ice"]);

    // The answer names only the choices ("half sugar" is an alias of 50% sugar); the item was already chosen.
    reply(ctx, "Large, half sugar, less ice");
    const added = addItemAction(ctx, { item_id: "taro-milk-tea", said: "Large, half sugar, less ice", choices: SIZE_SUGAR_ICE });
    expect(added).toMatchObject({ ok: true, added_line_id: "l1" });
    expect("offer" in added && added.offer).toContain("toppings");
    expect(ctx.state.pendingOffers).toMatchObject([{ lineId: "l1", meal: null, groups: [{ groupId: "toppings" }] }]);

    reply(ctx, "Pearls and pudding");
    const topped = updateItemAction(ctx, {
      line_id: "l1",
      said: "Pearls and pudding",
      choices: [{ group_id: "toppings", option_ids: ["pearls", "pudding"] }],
    });
    expect(topped).toMatchObject({ ok: true });
    expect(ctx.state.cart.lines[0]!.modifiers.toppings).toEqual(["pearls", "pudding"]);
    expect(ctx.state.pendingOffers).toEqual([]);
  });

  it("adds a fully spoken drink straight away and still offers toppings once", () => {
    const ctx = withMenu(teaMenu, context("Large classic milk tea, no sugar, regular ice"));
    const added = addItemAction(ctx, {
      item_id: "classic-milk-tea",
      said: "Large classic milk tea, no sugar, regular ice",
      choices: [
        { group_id: "tea-size", option_ids: ["large"] },
        { group_id: "sugar", option_ids: ["0"] },
        { group_id: "ice", option_ids: ["regular"] },
      ],
    });
    expect(added).toMatchObject({ ok: true });
    expect(ctx.state.pendingOffers).toHaveLength(1);
  });

  it("doesn't offer toppings the customer already chose", () => {
    const ctx = withMenu(teaMenu, context("Large mango slush, 25% sugar, with coconut jelly"));
    const added = addItemAction(ctx, {
      item_id: "mango-slush",
      said: "Large mango slush, 25% sugar, with coconut jelly",
      choices: [
        { group_id: "tea-size", option_ids: ["large"] },
        { group_id: "sugar", option_ids: ["25"] },
        { group_id: "toppings", option_ids: ["coconut-jelly"] },
      ],
    });
    expect(added).toMatchObject({ ok: true });
    expect("offer" in added).toBe(false);
    expect(ctx.state.pendingOffers).toEqual([]);
  });

  it("holds an ice level the customer didn't say", () => {
    const ctx = withMenu(teaMenu, context("Large classic milk tea, no sugar, regular ice"));
    const result = addItemAction(ctx, {
      item_id: "classic-milk-tea",
      said: "Large classic milk tea, no sugar, regular ice",
      choices: [
        { group_id: "tea-size", option_ids: ["large"] },
        { group_id: "sugar", option_ids: ["0"] },
        { group_id: "ice", option_ids: ["none"] },
      ],
    });
    expect(result).toMatchObject({ ok: false, error: "confirm_needed" });
  });

  it("lets offers lapse once the customer has answered something else", () => {
    const ctx = withMenu(teaMenu, context("Large classic milk tea, no sugar, regular ice"));
    addItemAction(ctx, {
      item_id: "classic-milk-tea",
      said: "Large classic milk tea, no sugar, regular ice",
      choices: [
        { group_id: "tea-size", option_ids: ["large"] },
        { group_id: "sugar", option_ids: ["0"] },
        { group_id: "ice", option_ids: ["regular"] },
      ],
    });
    finishTurn(ctx.state);
    expect(ctx.state.pendingOffers).toHaveLength(1); // still open for the customer's answer
    reply(ctx, "That's all");
    finishTurn(ctx.state);
    expect(ctx.state.pendingOffers).toEqual([]);
  });
});

describe("meal offer", () => {
  it("offers the meal for a burger on its own and makes it one after a yes", () => {
    const ctx = withMenu(demoMenu, context("A cheeseburger with no pickles"), { offerMeals: true });
    const added = addItemAction(ctx, {
      item_id: "cheeseburger",
      said: "A cheeseburger with no pickles",
      choices: [{ group_id: "hold-classic", option_ids: ["no-pickles"] }],
    });
    expect("offer" in added && added.offer).toContain("make_meal");
    expect(ctx.state.pendingOffers).toMatchObject([{ lineId: "l1", meal: { itemId: "cheeseburger-meal", extra: 400 } }]);

    // Not before the customer answers.
    expect(makeMealAction(ctx, { line_id: "l1", said: "A cheeseburger" })).toMatchObject({ error: "wait_for_answer" });

    reply(ctx, "Yes with a lemonade");
    const meal = makeMealAction(ctx, {
      line_id: "l1",
      said: "Yes with a lemonade",
      choices: [{ group_id: "meal-drink", option_ids: ["lemonade"] }],
    });
    expect(meal).toMatchObject({ ok: true, replaced_line_id: "l1" });
    expect(ctx.state.cart.lines).toHaveLength(1);
    expect(ctx.state.cart.lines[0]).toMatchObject({
      itemId: "cheeseburger-meal",
      modifiers: { "hold-classic": ["no-pickles"], "meal-drink": ["lemonade"] },
    });
    expect(ctx.state.pendingOffers).toEqual([]);
  });

  it("keeps the burger until the meal's drink is chosen", () => {
    const ctx = withMenu(demoMenu, context("A double stack"), { offerMeals: true });
    addItemAction(ctx, { item_id: "double-stack", said: "A double stack" });
    reply(ctx, "Yes please");
    expect(makeMealAction(ctx, { line_id: "l1", said: "Yes please" })).toMatchObject({ ok: false, error: "missing_choice" });
    expect(ctx.state.pendingChoice).toMatchObject({ itemId: "double-stack-meal", replacesLineId: "l1" });
    expect(ctx.state.cart.lines.map((l) => l.itemId)).toEqual(["double-stack"]);

    reply(ctx, "Cola zero");
    const added = addItemAction(ctx, {
      item_id: "double-stack-meal",
      said: "Cola zero",
      choices: [{ group_id: "meal-drink", option_ids: ["cola-zero"] }],
    });
    expect(added).toMatchObject({ ok: true, replaced_line_id: "l1" });
    expect(ctx.state.cart.lines.map((l) => l.itemId)).toEqual(["double-stack-meal"]);
  });

  it("doesn't offer meals when the owner turned it off, or for items without one", () => {
    const off = withMenu(demoMenu, context("A cheeseburger"), { offerMeals: false });
    expect("offer" in addItemAction(off, { item_id: "cheeseburger", said: "A cheeseburger" })).toBe(false);
    const fries = withMenu(demoMenu, context("Fries"), { offerMeals: true });
    expect("offer" in addItemAction(fries, { item_id: "fries", said: "Fries" })).toBe(false);
  });

  it("refuses to make a meal nobody asked for", () => {
    const ctx = withMenu(demoMenu, context("A cheeseburger"), { offerMeals: false });
    addItemAction(ctx, { item_id: "cheeseburger", said: "A cheeseburger" });
    reply(ctx, "And a cola");
    expect(makeMealAction(ctx, { line_id: "l1", said: "And a cola" })).toMatchObject({ error: "not_offered" });
    reply(ctx, "Actually make it a meal with a cola");
    expect(
      makeMealAction(ctx, { line_id: "l1", said: "make it a meal with a cola", choices: [{ group_id: "meal-drink", option_ids: ["cola"] }] }),
    ).toMatchObject({ ok: true });
  });
});
