import { describe, expect, it } from "vitest";
import { demoMenu, priceCart, type Order } from "@foa/core";
import { catalogToMenu, type CatalogObject } from "../../src/square/catalog";
import type { SquareClient } from "../../src/square/client";
import { addedTax, createSquarePos, toSquareOrder } from "../../src/square/orders";

const money = (amount: number) => ({ amount, currency: "AUD" });
const location = { id: "LOC1", business_name: "Corner Cafe", currency: "AUD" };
const { menu } = catalogToMenu(
  [
    {
      type: "MODIFIER_LIST",
      id: "ML_MILK",
      modifier_list_data: {
        name: "Milk",
        modifiers: [
          { type: "MODIFIER", id: "MOD_FULL", modifier_data: { name: "Full cream", price_money: money(0), on_by_default: true } },
          { type: "MODIFIER", id: "MOD_OAT", modifier_data: { name: "Oat", price_money: money(70) } },
        ],
      },
    },
    {
      type: "ITEM",
      id: "ITEM_LATTE",
      item_data: {
        name: "Latte",
        variations: [
          { type: "ITEM_VARIATION", id: "VAR_S", item_variation_data: { name: "Small", pricing_type: "FIXED_PRICING", price_money: money(450) } },
          { type: "ITEM_VARIATION", id: "VAR_L", item_variation_data: { name: "Large", pricing_type: "FIXED_PRICING", price_money: money(550) } },
        ],
        modifier_list_info: [{ modifier_list_id: "ML_MILK", min_selected_modifiers: 1 }],
      },
    },
  ] satisfies CatalogObject[],
  location,
);

function order(lines: Parameters<typeof priceCart>[0]["lines"], m = menu, overrides: Partial<Order> = {}): Order {
  const priced = priceCart({ lines }, m);
  return {
    id: "6f1c0a52-1111-4222-8333-444455556666",
    number: 104,
    pickupCode: "1234",
    channel: "kiosk",
    payment: "kiosk",
    status: "paid",
    lines: priced.lines,
    subtotal: priced.subtotal,
    currency: priced.currency,
    answers: [
      { questionId: "name", question: "Name for the order?", answer: "Sam", sendToKitchen: true },
      { questionId: "dine-in", question: "Dine in or take away?", answer: "Take away", sendToKitchen: true },
      { questionId: "secret", question: "How did you hear about us?", answer: "Friend", sendToKitchen: false },
    ],
    createdAt: "2026-07-15T04:00:00Z",
    updatedAt: "2026-07-15T04:00:00Z",
    ...overrides,
  };
}

describe("toSquareOrder", () => {
  it("sends the chosen variation as the item and options as catalog modifiers", () => {
    const square = toSquareOrder(order([{ lineId: "l1", itemId: "latte", qty: 2, modifiers: { "latte-size": ["large"], milk: ["oat"] } }]), menu, "LOC1");
    expect(square.line_items).toEqual([{ quantity: "2", catalog_object_id: "VAR_L", modifiers: [{ catalog_object_id: "MOD_OAT" }] }]);
    expect(square).toMatchObject({
      location_id: "LOC1",
      reference_id: "#104",
      source: { name: "AI ordering" },
      pricing_options: { auto_apply_taxes: true },
    });
    expect(square.fulfillments).toEqual([
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickup_details: { recipient: { display_name: "Sam" }, schedule_type: "ASAP", note: "Dine in or take away? Take away" },
      },
    ]);
  });

  it("names and prices lines itself when the menu didn't come from Square", () => {
    const square = toSquareOrder(
      order([{ lineId: "l1", itemId: "fries", qty: 1, modifiers: { "fries-size": ["large"] } }], demoMenu, { answers: [] }),
      demoMenu,
      "LOC1",
    );
    const fries = demoMenu.items.find((i) => i.id === "fries")!;
    expect(square.line_items).toEqual([
      { quantity: "1", name: "Fries", base_price_money: money(fries.price), modifiers: [{ name: "Large", base_price_money: expect.objectContaining({ currency: "AUD" }) }] },
    ]);
    expect(square.fulfillments[0]!.pickup_details).toEqual({ recipient: { display_name: "Order #104" }, schedule_type: "ASAP" });
  });
});

// Square's calculated order: 10% sales tax added on top, and GST already in the price.
const calculated = {
  taxes: [
    { uid: "sales", type: "ADDITIVE" as const },
    { uid: "gst", type: "INCLUSIVE" as const },
  ],
  line_items: [
    {
      applied_taxes: [
        { tax_uid: "sales", applied_money: { amount: 90 } },
        { tax_uid: "gst", applied_money: { amount: 82 } },
      ],
    },
  ],
};

describe("addedTax", () => {
  it("counts only tax added on top of the prices", () => {
    expect(addedTax(calculated)).toBe(90);
    expect(addedTax({ ...calculated, taxes: [{ uid: "sales", type: "INCLUSIVE" }, { uid: "gst", type: "INCLUSIVE" }] })).toBe(0);
    expect(addedTax({})).toBe(0);
  });
});

describe("createSquarePos", () => {
  function fakeClient() {
    const calls: { method: string; path: string; body: any }[] = [];
    const client: SquareClient = {
      config: { accessToken: "test", locationId: "LOC1", environment: "sandbox" },
      async request<T>(method: string, path: string, body?: unknown) {
        calls.push({ method, path, body });
        if (path === "/v2/orders") return { order: { id: "SQ_ORDER", total_money: { amount: 1342, currency: "AUD" } } } as T;
        if (path === "/v2/orders/calculate") return { order: calculated } as T;
        return { payment: { id: "SQ_PAY" } } as T;
      },
    };
    return { client, calls };
  }

  it("asks Square for the tax it adds to a cart, with the seller's taxes applied", async () => {
    const { client, calls } = fakeClient();
    const pos = createSquarePos(client, menu);
    const lines = order([{ lineId: "l1", itemId: "latte", qty: 2, modifiers: { "latte-size": ["large"], milk: ["oat"] } }]).lines;

    expect(await pos.quote!(lines)).toEqual({ tax: 90 });
    expect(calls[0]).toMatchObject({
      path: "/v2/orders/calculate",
      body: { order: { location_id: "LOC1", line_items: [{ quantity: "2", catalog_object_id: "VAR_L" }], pricing_options: { auto_apply_taxes: true } } },
    });
  });

  it("creates the order, then records what the customer paid", async () => {
    const { client, calls } = fakeClient();
    const pos = createSquarePos(client, menu);
    const placed = order([{ lineId: "l1", itemId: "latte", qty: 1, modifiers: { "latte-size": ["small"], milk: ["full-cream"] } }]);

    const ref = await pos.submitOrder(placed);
    expect(ref).toEqual({ orderId: "SQ_ORDER", total: 1342, currency: "AUD" });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/v2/orders", body: { idempotency_key: `order-${placed.id}` } });

    expect(await pos.orderPaid!({ ...placed, tax: 45, pos: { name: "square", ...ref! } })).toEqual({ paymentId: "SQ_PAY" });
    expect(calls[1]).toMatchObject({
      path: "/v2/payments",
      body: {
        idempotency_key: `pay-${placed.id}`,
        source_id: "EXTERNAL",
        external_details: { type: "OTHER", source: "Paid at kiosk (AI ordering)" },
        amount_money: { amount: 450 + 45, currency: "AUD" },
        order_id: "SQ_ORDER",
        location_id: "LOC1",
      },
    });
    expect(calls[1]!.body.idempotency_key.length).toBeLessThanOrEqual(45);
  });
});
