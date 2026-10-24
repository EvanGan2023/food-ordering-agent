import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { demoMenu, type MessageStreamEvent, type Order, type SessionView, type Settings } from "@foa/core";
import { createApp } from "../src/app";
import { migrate, openDb, type Db } from "../src/db";
import { kitchenScreenPos } from "../src/pos";
import { Store } from "../src/store";

const AFTERNOON = new Date("2026-07-15T04:00:00Z");
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

let db: Db;
let app: ReturnType<typeof createApp>;
let model: MockLanguageModelV4;

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

const newSession = async (channel = "online") => (await call<SessionView>("POST", "/sessions", { channel })).json;

beforeAll(async () => {
  db = await openDb({});
  await migrate(db);
  model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "add_item",
            input: JSON.stringify({ item_id: "double-stack-meal", said: "Double stack meal" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text", text: "Which drink would you like with your meal?" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
    doStream: [
      {
        stream: convertArrayToReadableStream([
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "add_item",
            input: JSON.stringify({
              item_id: "fries",
              said: "a large fries",
              choices: [{ group_id: "fries-size", option_ids: ["large"] }],
            }),
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ]),
      },
      {
        stream: convertArrayToReadableStream([
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Large fries, done. " },
          { type: "text-delta", id: "t1", delta: "Anything else?" },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ]),
      },
    ],
  });
  app = createApp({ store: new Store(db), menu: demoMenu, pos: kitchenScreenPos, model, now: () => AFTERNOON });
});

afterAll(() => db.close());

describe("API", () => {
  it("serves the menu and default settings", async () => {
    expect((await call<{ id: string }>("GET", "/menu")).json.id).toBe("patty-and-co");
    const settings = (await call<Settings>("GET", "/settings")).json;
    expect(settings.questions.map((q) => q.id)).toContain("dine-in");
    expect(settings).toMatchObject({ restaurantName: "Patty & Co.", offerMeals: true, replyLength: "short", prices: "when_asked", houseStyle: "" });
  });

  it("runs an order from tap to kitchen to collected", async () => {
    const session = await newSession("online");
    expect(session.missingAnswers).toEqual(["name", "dine-in", "pickup-time"]);

    const added = await call<SessionView>("POST", `/sessions/${session.id}/cart/add`, {
      itemId: "cheeseburger",
      qty: 2,
      modifiers: { "hold-classic": ["no-pickles"] },
    });
    expect(added.status).toBe(200);
    expect(added.json.cart.subtotal).toBe(1040);

    const updated = await call<SessionView>("POST", `/sessions/${session.id}/cart/update`, { lineId: "l1", qty: 3 });
    expect(updated.json.cart.subtotal).toBe(1560);

    const blocked = await call<{ error: { code: string } }>("POST", `/sessions/${session.id}/checkout`, {
      payment: "at_pickup",
    });
    expect(blocked.status).toBe(422);
    expect(blocked.json.error.code).toBe("missing_answers");

    for (const [questionId, value] of [
      ["name", "Sam"],
      ["dine-in", "takeaway"],
      ["pickup-time", "asap"],
    ]) {
      const answered = await call<SessionView>("POST", `/sessions/${session.id}/answers`, { questionId, value });
      expect(answered.status).toBe(200);
    }

    const placed = await call<Order>("POST", `/sessions/${session.id}/checkout`, { payment: "at_pickup" });
    expect(placed.status).toBe(201);
    const order = placed.json;
    expect(order).toMatchObject({ status: "awaiting_payment", subtotal: 1560, number: 101 });
    expect(order.pickupCode).toMatch(/^\d{4}$/);
    expect(order.answers.map((a) => a.answer)).toEqual(["Sam", "Takeaway", "ASAP"]);

    // The session is closed once the order is placed.
    const again = await call("POST", `/sessions/${session.id}/cart/add`, { itemId: "cola" });
    expect(again.status).toBe(409);

    // Pay at the kiosk with the pickup code.
    const found = await call<Order>("GET", `/orders/by-code/${order.pickupCode}`);
    expect(found.json.id).toBe(order.id);
    expect((await call<Order>("POST", `/orders/${order.id}/pay`)).json.status).toBe("paid");

    for (const status of ["preparing", "ready", "collected"]) {
      expect((await call<Order>("POST", `/orders/${order.id}/status`, { status })).json.status).toBe(status);
    }
    const active = (await call<Order[]>("GET", "/orders")).json;
    expect(active.some((o) => o.id === order.id)).toBe(false);
  });

  it("rejects invalid cart changes with the engine's error", async () => {
    const session = await newSession("kiosk");
    const res = await call<{ error: { code: string } }>("POST", `/sessions/${session.id}/cart/add`, {
      itemId: "sundae",
    });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatchObject({ code: "missing_choice", groups: [{ groupId: "sundae-topping" }] });

    const unknown = await call("POST", `/sessions/${session.id}/cart/remove`, { lineId: "l9" });
    expect(unknown.status).toBe(404);
  });

  it("refuses to skip order statuses", async () => {
    const session = await newSession("kiosk");
    await call("POST", `/sessions/${session.id}/cart/add`, { itemId: "cola" });
    await call("POST", `/sessions/${session.id}/answers`, { questionId: "name", value: "Ali" });
    await call("POST", `/sessions/${session.id}/answers`, { questionId: "dine-in", value: "Dine in" });
    const order = (await call<Order>("POST", `/sessions/${session.id}/checkout`, { payment: "kiosk" })).json;
    expect(order.status).toBe("paid");
    expect((await call("POST", `/orders/${order.id}/status`, { status: "collected" })).status).toBe(409);
  });

  it("runs the agent and remembers the pending choice", async () => {
    const session = await newSession("online");
    const res = await call<{ reply: string; session: SessionView }>("POST", `/sessions/${session.id}/message`, {
      text: "Double stack meal please",
    });
    expect(res.status).toBe(200);
    expect(res.json.reply).toBe("Which drink would you like with your meal?");
    expect(res.json.session.pendingChoice).toMatchObject({ groups: [{ groupId: "meal-drink" }] });
    expect(res.json.session.pendingOffers).toEqual([]);
    expect(res.json.session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("streams the reply as it's written, then the saved session", async () => {
    const session = await newSession("online");
    const res = await app.request(`/api/sessions/${session.id}/message/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "a large fries" }),
    });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as MessageStreamEvent);
    expect(events.slice(0, -1)).toEqual([
      { type: "text", text: "Large fries, done. " },
      { type: "text", text: "Anything else?" },
    ]);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", reply: "Large fries, done. Anything else?" });
    if (done?.type !== "done") return;
    expect(done.session.cart.lines.map((l) => l.itemId)).toEqual(["fries"]);
    expect(done.session.messages.map((m) => m.text)).toEqual(["a large fries", "Large fries, done. Anything else?"]);
  });

  it("reports the agent as unavailable when it is turned off", async () => {
    const settings = (await call<Settings>("GET", "/settings")).json;
    await call("PUT", "/settings", { ...settings, agentEnabled: false });
    const session = await newSession("online");
    const res = await call<{ error: { code: string } }>("POST", `/sessions/${session.id}/message`, { text: "hi" });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe("agent_unavailable");
    const streamed = await call<{ error: { code: string } }>("POST", `/sessions/${session.id}/message/stream`, { text: "hi" });
    expect(streamed.status).toBe(503);
    expect(streamed.json.error.code).toBe("agent_unavailable");
    await call("PUT", "/settings", settings);
  });

  it("validates settings", async () => {
    const settings = (await call<Settings>("GET", "/settings")).json;
    expect((await call("PUT", "/settings", { ...settings, replyLength: "essay" })).status).toBe(400);
    expect((await call("PUT", "/settings", { ...settings, houseStyle: "x".repeat(501) })).status).toBe(400);
    const bad = await call("PUT", "/settings", {
      ...settings,
      questions: [...settings.questions, { ...settings.questions[0], text: "dup" }],
    });
    expect(bad.status).toBe(400);
  });
});
