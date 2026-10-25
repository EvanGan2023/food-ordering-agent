import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { defaultQuestions, demoMenu, questionsFor } from "@foa/core";
import { newOrderState, runAgent, staticInstructions, type ReplyEvent, type RunAgentInput } from "../src";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const toolCall = (id: string, toolName: string, input: unknown) => ({
  type: "tool-call" as const,
  toolCallId: id,
  toolName,
  input: JSON.stringify(input),
});

function input(model: MockLanguageModelV4, overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    model,
    menu: demoMenu,
    restaurantName: "Patty & Co.",
    upsellEnabled: false,
    channel: "online",
    questions: questionsFor(defaultQuestions, "online"),
    state: newOrderState(),
    history: [],
    userText: "Two cheeseburgers no pickles and a large fries",
    now: () => new Date("2026-07-15T04:00:00Z"),
    ...overrides,
  };
}

describe("runAgent", () => {
  it("builds the cart through tool calls and returns the reply", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            toolCall("c1", "add_item", {
              item_id: "cheeseburger",
              said: "Two cheeseburgers no pickles",
              qty: 2,
              choices: [{ group_id: "hold-classic", option_ids: ["no-pickles"] }],
            }),
            toolCall("c2", "add_item", { item_id: "fries", said: "a large fries", choices: [{ group_id: "fries-size", option_ids: ["large"] }] }),
          ],
          finishReason: { unified: "tool-calls", raw: "tool_use" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Got it. Anything else?" }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await runAgent(input(model));

    expect(result.reply).toBe("Got it. Anything else?");
    expect(result.toolCalls).toEqual(["add_item", "add_item"]);
    expect(result.state.cart.lines.map((l) => [l.itemId, l.qty, l.modifiers])).toEqual([
      ["cheeseburger", 2, { "hold-classic": ["no-pickles"] }],
      ["fries", 1, { "fries-size": ["large"] }],
    ]);

    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain("double-stack-meal");
    expect(prompt).toContain("Current cart:");
  });

  it("streams the reply as it's written, dropping text written before more tool calls", async () => {
    const text = (id: string, ...deltas: string[]) => [
      { type: "text-start" as const, id },
      ...deltas.map((delta) => ({ type: "text-delta" as const, id, delta })),
      { type: "text-end" as const, id },
    ];
    const finish = (unified: "tool-calls" | "stop") => ({ type: "finish" as const, finishReason: { unified, raw: undefined }, usage });
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: convertArrayToReadableStream([
            ...text("t1", "Let me add that."),
            toolCall("c1", "add_item", { item_id: "fries", said: "a large fries", choices: [{ group_id: "fries-size", option_ids: ["large"] }] }),
            finish("tool-calls"),
          ]),
        },
        { stream: convertArrayToReadableStream([...text("t2", "Got it. ", "Anything else?"), finish("stop")]) },
      ],
    });
    const events: ReplyEvent[] = [];

    const result = await runAgent(input(model, { userText: "a large fries", onReply: (e) => events.push(e) }));

    expect(events).toEqual([
      { type: "text", text: "Let me add that." },
      { type: "restart" },
      { type: "text", text: "Got it. " },
      { type: "text", text: "Anything else?" },
    ]);
    expect(result.reply).toBe("Got it. Anything else?");
    expect(result.state.cart.lines.map((l) => l.itemId)).toEqual(["fries"]);
  });

  it("leaves the saved order untouched when the model call fails", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("network down");
      },
    });
    const state = newOrderState();
    await expect(runAgent(input(model, { state }))).rejects.toThrow();
    expect(state.cart.lines).toEqual([]);
  });
});

describe("staticInstructions", () => {
  const base = { menu: demoMenu, restaurantName: "Patty & Co.", upsellEnabled: false };

  it("keeps replies short and leaves prices out by default", () => {
    const prompt = staticInstructions(base);
    expect(prompt).toContain("about 20 words");
    expect(prompt).toContain("Never say prices unless");
    expect(prompt).not.toContain("owner's notes");
  });

  it("follows the owner's reply style", () => {
    const prompt = staticInstructions({
      ...base,
      style: { replyLength: "detailed", prices: "always", houseStyle: "Greet people with G'day." },
    });
    expect(prompt).toContain("about 60 words");
    expect(prompt).toContain("Say each item's price");
    expect(prompt).toContain("never change the rules above):\nGreet people with G'day.");
  });

  it("says totals are plus tax only where tax is added at checkout", () => {
    expect(staticInstructions(base)).not.toContain("plus tax");
    expect(staticInstructions({ ...base, menu: { ...demoMenu, taxAddedAtCheckout: true } })).toContain('say "plus tax" after any total');
  });
});
