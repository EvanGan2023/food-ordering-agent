import { describe, expect, it } from "vitest";
import {
  addItem,
  demoMenu,
  describeCart,
  emptyCart,
  priceCart,
  removeItem,
  updateItem,
  validateForCheckout,
  type Cart,
} from "../src";

// 2pm in Sydney (July, no daylight saving): lunch menu, breakfast over.
const AFTERNOON = new Date("2026-07-15T04:00:00Z");
// 10am in Sydney: breakfast still on.
const MORNING = new Date("2026-07-15T00:00:00Z");

function mustAdd(cart: Cart, input: Parameters<typeof addItem>[2], now = AFTERNOON): Cart {
  const result = addItem(cart, demoMenu, input, now);
  if (!result.ok) throw new Error(`addItem failed: ${JSON.stringify(result.error)}`);
  return result.value.cart;
}

describe("addItem", () => {
  it("applies default options for groups the customer didn't mention", () => {
    const result = addItem(emptyCart(), demoMenu, { itemId: "fries" }, AFTERNOON);
    expect(result.ok && result.value.line.modifiers).toEqual({ "fries-size": ["medium"] });
  });

  it("asks for a required choice that has no default", () => {
    const result = addItem(emptyCart(), demoMenu, { itemId: "cheeseburger-meal" }, AFTERNOON);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: "missing_choice", groups: [{ groupId: "meal-drink", groupName: "Meal drink" }] });
    if (result.error.code === "missing_choice") {
      expect(result.error.groups[0]!.options.map((o) => o.id)).toContain("cola-zero");
    }
  });

  it("asks for every missing required choice at once", () => {
    const result = addItem(emptyCart(), demoMenu, { itemId: "kids-pack" }, AFTERNOON);
    expect(!result.ok && result.error.code === "missing_choice" && result.error.groups.map((g) => g.groupId)).toEqual([
      "kids-main",
      "kids-drink",
    ]);
  });

  it("rejects items that aren't on the menu", () => {
    const result = addItem(emptyCart(), demoMenu, { itemId: "lobster-roll" }, AFTERNOON);
    expect(result).toEqual({ ok: false, error: { code: "unknown_item", itemId: "lobster-roll" } });
  });

  it("rejects options that don't belong to the group", () => {
    const result = addItem(
      emptyCart(),
      demoMenu,
      { itemId: "fries", modifiers: { "fries-size": ["jumbo"] } },
      AFTERNOON,
    );
    expect(result).toEqual({ ok: false, error: { code: "invalid_option", groupId: "fries-size", optionId: "jumbo" } });
  });

  it("rejects modifier groups the item doesn't have", () => {
    const result = addItem(
      emptyCart(),
      demoMenu,
      { itemId: "fries", modifiers: { "coffee-milk": ["oat"] } },
      AFTERNOON,
    );
    expect(result.ok || result.error.code).toBe("unknown_modifier_group");
  });

  it("enforces the maximum number of choices", () => {
    const result = addItem(
      emptyCart(),
      demoMenu,
      { itemId: "chicken-bites-6", modifiers: { "bites-sauce": ["bbq", "ranch", "aioli"] } },
      AFTERNOON,
    );
    expect(result).toEqual({ ok: false, error: { code: "too_many_choices", groupId: "bites-sauce", max: 2 } });
  });

  it("enforces the minimum number of choices", () => {
    const result = addItem(
      emptyCart(),
      demoMenu,
      { itemId: "chicken-bites-20", modifiers: { "bites-sauce-share": ["bbq"] } },
      AFTERNOON,
    );
    expect(result.ok || result.error.code).toBe("missing_choice");
  });

  it("only sells breakfast during breakfast hours", () => {
    expect(addItem(emptyCart(), demoMenu, { itemId: "hash-brown" }, MORNING).ok).toBe(true);
    const late = addItem(emptyCart(), demoMenu, { itemId: "hash-brown" }, AFTERNOON);
    expect(late.ok || late.error.code).toBe("unavailable_now");
  });

  it("refuses out-of-stock items", () => {
    const soldOut = {
      ...demoMenu,
      items: demoMenu.items.map((item) => (item.id === "onion-rings" ? { ...item, inStock: false } : item)),
    };
    const result = addItem(emptyCart(), soldOut, { itemId: "onion-rings" }, AFTERNOON);
    expect(result.ok || result.error.code).toBe("out_of_stock");
  });

  it("rejects silly quantities", () => {
    for (const qty of [0, -1, 1.5, 51]) {
      const result = addItem(emptyCart(), demoMenu, { itemId: "cola", qty }, AFTERNOON);
      expect(result.ok || result.error.code).toBe("invalid_quantity");
    }
  });
});

describe("updateItem and removeItem", () => {
  it("changes one group and keeps the others", () => {
    let cart = mustAdd(emptyCart(), {
      itemId: "double-stack-meal",
      modifiers: { "meal-drink": ["cola"], "hold-deluxe": ["no-onion"] },
    });
    const result = updateItem(cart, demoMenu, "l1", { modifiers: { "meal-size": ["large"] } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cart = result.value.cart;
    expect(cart.lines[0]?.modifiers).toMatchObject({
      "meal-size": ["large"],
      "meal-drink": ["cola"],
      "hold-deluxe": ["no-onion"],
    });
  });

  it("changes quantity", () => {
    const cart = mustAdd(emptyCart(), { itemId: "cola" });
    const result = updateItem(cart, demoMenu, "l1", { qty: 3 });
    expect(result.ok && result.value.line.qty).toBe(3);
  });

  it("removes a line and keeps line ids unique", () => {
    let cart = mustAdd(emptyCart(), { itemId: "cola" });
    cart = mustAdd(cart, { itemId: "fries" });
    const removed = removeItem(cart, "l1");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    cart = mustAdd(removed.value.cart, { itemId: "lemonade" });
    expect(cart.lines.map((l) => l.lineId)).toEqual(["l2", "l3"]);
  });

  it("reports unknown lines", () => {
    expect(removeItem(emptyCart(), "l9")).toEqual({ ok: false, error: { code: "unknown_line", lineId: "l9" } });
  });
});

describe("pricing and checkout", () => {
  it("prices from menu data and adds option prices", () => {
    let cart = mustAdd(emptyCart(), { itemId: "cheeseburger", qty: 2, modifiers: { "hold-classic": ["no-pickles"] } });
    cart = mustAdd(cart, { itemId: "fries", modifiers: { "fries-size": ["large"] } });
    const priced = priceCart(cart, demoMenu);
    expect(priced.lines.map((l) => [l.name, l.unitPrice, l.lineTotal])).toEqual([
      ["Cheeseburger", 520, 1040],
      ["Fries", 500, 500],
    ]);
    expect(priced.subtotal).toBe(1540);
  });

  it("refuses to check out an empty cart", () => {
    expect(validateForCheckout(emptyCart(), demoMenu, AFTERNOON)).toEqual({ ok: false, error: { code: "empty_cart" } });
  });

  it("re-checks availability at checkout", () => {
    const cart = mustAdd(emptyCart(), { itemId: "hash-brown" }, MORNING);
    const result = validateForCheckout(cart, demoMenu, AFTERNOON);
    expect(result.ok || result.error.code).toBe("unavailable_now");
  });

  it("describes the cart for a read-back", () => {
    let cart = mustAdd(emptyCart(), { itemId: "sundae", modifiers: { "sundae-topping": ["hot-fudge"] } });
    cart = mustAdd(cart, { itemId: "cola-zero", modifiers: { "drink-size": ["large"] } });
    const text = describeCart(priceCart(cart, demoMenu));
    expect(text[0]).toBe("1 × Swirl Sundae (Hot fudge): $3.90");
    expect(text[1]).toBe("1 × Cola Zero (Large): $3.60");
    expect(text[2]).toBe("Subtotal: $7.50");
  });
});
