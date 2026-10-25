import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoMenu, orderTotal, type Order, type SessionView } from "@foa/core";
import { createApp } from "../src/app";
import { migrate, openDb, type Db } from "../src/db";
import type { PosAdapter } from "../src/pos";
import { Store } from "../src/store";

let db: Db;
let app: ReturnType<typeof createApp>;
const steps: string[] = [];
let failNext = false;
let quotes = 0;
let failQuote = false;

const pos: PosAdapter = {
  name: "test-pos",
  // 10% added on top, like a US sales tax.
  async quote(lines) {
    quotes++;
    if (failQuote) throw new Error("POS is down");
    return { tax: Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) / 10) };
  },
  async submitOrder(order) {
    steps.push(`submit #${order.number}`);
    if (failNext) {
      failNext = false;
      throw new Error("POS is down");
    }
    return { orderId: `POS-${order.number}`, total: order.subtotal + 100 };
  },
  async orderPaid(order) {
    steps.push(`paid #${order.number} ${order.pos?.orderId}`);
    return { paymentId: `PAY-${order.number}` };
  },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function placeOrder(payment: "kiosk" | "at_pickup"): Promise<Order> {
  const session = await call<SessionView>("POST", "/sessions", { channel: "kiosk" });
  await call("POST", `/sessions/${session.id}/cart/add`, { itemId: "cola", modifiers: { "drink-size": ["medium"] } });
  for (const [questionId, value] of [
    ["name", "Sam"],
    ["dine-in", "takeaway"],
  ]) {
    await call("POST", `/sessions/${session.id}/answers`, { questionId, value });
  }
  return call<Order>("POST", `/sessions/${session.id}/checkout`, { payment });
}

beforeAll(async () => {
  db = await openDb({});
  await migrate(db);
  app = createApp({ store: new Store(db), menu: demoMenu, pos, model: null, now: () => new Date("2026-07-15T04:00:00Z") });
});

afterAll(() => db.close());

describe("sending orders to the POS", () => {
  it("sends a paid order and its payment, and keeps the POS reference", async () => {
    const order = await placeOrder("kiosk");
    expect(order.status).toBe("paid");
    expect(order.pos).toEqual({ name: "test-pos", orderId: `POS-${order.number}`, total: order.subtotal + 100, paymentId: `PAY-${order.number}` });
    expect(steps.slice(-2)).toEqual([`submit #${order.number}`, `paid #${order.number} POS-${order.number}`]);
    expect((await call<Order>("GET", `/orders/${order.id}`)).pos?.paymentId).toBe(`PAY-${order.number}`);
  });

  it("sends a pay-at-counter order's payment once staff take it", async () => {
    const order = await placeOrder("at_pickup");
    expect(order.pos).toEqual({ name: "test-pos", orderId: `POS-${order.number}`, total: order.subtotal + 100 });
    const paid = await call<Order>("POST", `/orders/${order.id}/pay`);
    expect(paid).toMatchObject({ status: "paid", pos: { paymentId: `PAY-${order.number}` } });
  });

  it("keeps the order when the POS fails, with the error for staff", async () => {
    failNext = true;
    const order = await placeOrder("kiosk");
    expect(order).toMatchObject({ status: "paid", pos: { name: "test-pos", error: "POS is down" } });
    expect(steps.at(-1)).toBe(`submit #${order.number}`); // no payment for an order the POS doesn't have
    expect((await call<Order[]>("GET", "/orders")).some((o) => o.id === order.id)).toBe(true);
  });

  it("shows the tax the POS adds, asks once per cart and keeps it on the order", async () => {
    const session = await call<SessionView>("POST", "/sessions", { channel: "kiosk" });
    expect(session.tax).toBe(0);
    const before = quotes;
    const added = await call<SessionView>("POST", `/sessions/${session.id}/cart/add`, { itemId: "cheeseburger" });
    expect(added.tax).toBe(Math.round(added.cart.subtotal / 10));
    await call<SessionView>("GET", `/sessions/${session.id}`);
    expect(quotes - before).toBe(1);

    await call("POST", `/sessions/${session.id}/answers`, { questionId: "name", value: "Sam" });
    await call("POST", `/sessions/${session.id}/answers`, { questionId: "dine-in", value: "takeaway" });
    const order = await call<Order>("POST", `/sessions/${session.id}/checkout`, { payment: "kiosk" });
    expect(order).toMatchObject({ subtotal: added.cart.subtotal, tax: added.tax });
    expect(orderTotal(order)).toBe(added.cart.subtotal + added.tax);
  });

  it("still takes the order when the POS can't price the tax", async () => {
    failQuote = true;
    try {
      const session = await call<SessionView>("POST", "/sessions", { channel: "kiosk" });
      const added = await call<SessionView>("POST", `/sessions/${session.id}/cart/add`, { itemId: "cheeseburger", qty: 3 });
      expect(added.tax).toBe(0);
    } finally {
      failQuote = false;
    }
  });
});
