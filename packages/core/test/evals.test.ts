import { describe, expect, it } from "vitest";
import evals from "../../../evals/demo-orders.json";
import { addItem, demoMenu, emptyCart, validateForCheckout, type AddItemInput } from "../src";

// Checks that every expected cart in the eval set is valid on the demo menu and
// prices to the stated subtotal. The LLM agent evals reuse these same cases.

const DEFAULT_TIME = "2026-07-15T04:00:00Z";

describe("demo order evals", () => {
  it("covers a meaningful set of orders", () => {
    expect(evals.menuId).toBe(demoMenu.id);
    expect(evals.orders.length).toBeGreaterThanOrEqual(20);
  });

  it.each(evals.orders.map((order) => [order.id, order] as const))("%s builds the expected cart", (_id, order) => {
    const now = new Date(("at" in order && order.at) || DEFAULT_TIME);
    let cart = emptyCart();
    for (const line of order.lines as AddItemInput[]) {
      const result = addItem(cart, demoMenu, line, now);
      if (!result.ok) throw new Error(`${order.id}: ${JSON.stringify(result.error)}`);
      cart = result.value.cart;
    }
    const checkout = validateForCheckout(cart, demoMenu, now);
    expect(checkout.ok).toBe(true);
    if (checkout.ok) expect(checkout.value.subtotal).toBe(order.subtotal);
  });

  it.each(evals.clarifications.map((c) => [c.id, c] as const))("%s needs a follow-up", (_id, clarification) => {
    const now = new Date(("at" in clarification && clarification.at) || DEFAULT_TIME);
    const result = addItem(emptyCart(), demoMenu, clarification.attempt as AddItemInput, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(clarification.expectError);
  });
});
