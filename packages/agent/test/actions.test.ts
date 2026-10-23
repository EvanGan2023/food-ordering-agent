import { describe, expect, it } from "vitest";
import { defaultQuestions, demoMenu, questionsFor } from "@foa/core";
import {
  addItemAction,
  answerQuestionAction,
  clearCartAction,
  findItemsAction,
  newOrderState,
  removeItemAction,
  updateItemAction,
  type ActionContext,
} from "../src";

const AFTERNOON = new Date("2026-07-15T04:00:00Z");

const context = (): ActionContext => ({
  menu: demoMenu,
  questions: questionsFor(defaultQuestions, "online"),
  now: () => AFTERNOON,
  state: newOrderState(),
});

describe("order actions", () => {
  it("adds items with the customer's choices and returns the cart", () => {
    const ctx = context();
    const result = addItemAction(ctx, {
      item_id: "cheeseburger",
      qty: 2,
      choices: [{ group_id: "hold-classic", option_ids: ["no-pickles"] }],
    });
    expect(result).toMatchObject({ ok: true, added_line_id: "l1" });
    expect(ctx.state.cart.lines[0]).toMatchObject({ itemId: "cheeseburger", qty: 2 });
  });

  it("records a pending choice when a required option is missing", () => {
    const ctx = context();
    const result = addItemAction(ctx, { item_id: "double-stack-meal" });
    expect(result).toMatchObject({ ok: false, error: "missing_choice" });
    expect(ctx.state.pendingChoice).toMatchObject({ groupId: "meal-drink", itemName: "Double Stack Meal" });
    expect(ctx.state.cart.lines).toHaveLength(0);

    addItemAction(ctx, { item_id: "double-stack-meal", choices: [{ group_id: "meal-drink", option_ids: ["lemonade"] }] });
    expect(ctx.state.pendingChoice).toBeNull();
    expect(ctx.state.cart.lines).toHaveLength(1);
  });

  it("handles a multi-part amendment", () => {
    const ctx = context();
    addItemAction(ctx, { item_id: "cheeseburger-meal", choices: [{ group_id: "meal-drink", option_ids: ["cola"] }] });
    addItemAction(ctx, { item_id: "fries" });
    // "make the meal large, swap the fries for onion rings and add two cola zeros"
    updateItemAction(ctx, { line_id: "l1", choices: [{ group_id: "meal-size", option_ids: ["large"] }] });
    removeItemAction(ctx, "l2");
    addItemAction(ctx, { item_id: "onion-rings" });
    addItemAction(ctx, { item_id: "cola-zero", qty: 2 });
    expect(ctx.state.cart.lines.map((l) => [l.itemId, l.qty])).toEqual([
      ["cheeseburger-meal", 1],
      ["onion-rings", 1],
      ["cola-zero", 2],
    ]);
    expect(ctx.state.cart.lines[0]?.modifiers["meal-size"]).toEqual(["large"]);
  });

  it("starts over", () => {
    const ctx = context();
    addItemAction(ctx, { item_id: "fries" });
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
