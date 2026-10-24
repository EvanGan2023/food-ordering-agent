import { generateText, stepCountIs, streamText, type LanguageModel, type ModelMessage, type SystemModelMessage } from "ai";
import type { Channel, Menu, OrderQuestion, ReplyStyle } from "@foa/core";
import { finishTurn, type ActionContext, type OrderState } from "./actions";
import { staticInstructions, turnInstructions } from "./prompt";
import { createOrderTools } from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface RunAgentInput {
  model: LanguageModel;
  menu: Menu;
  restaurantName: string;
  upsellEnabled: boolean;
  /** Offer the meal when an item with a meal version is ordered on its own. */
  offerMeals?: boolean;
  /** How the owner wants replies: length, prices and house style. */
  style?: ReplyStyle;
  channel: Channel;
  /** Owner questions for this channel. */
  questions: OrderQuestion[];
  state: OrderState;
  /** Earlier turns, oldest first. The cart itself is always taken from `state`. */
  history: ChatTurn[];
  userText: string;
  now?: () => Date;
  /**
   * Streams the reply as it's written, so it can be shown and spoken before the turn ends.
   * "restart" means the text so far wasn't the reply (the model went on to call tools), so drop it.
   */
  onReply?: (event: ReplyEvent) => void;
}

export type ReplyEvent = { type: "text"; text: string } | { type: "restart" };

export interface RunAgentResult {
  reply: string;
  state: OrderState;
  toolCalls: string[];
  /** Every tool call with its input and result, for logs and evals. */
  toolTrace: { tool: string; input: unknown; output: unknown }[];
}

const MAX_HISTORY_TURNS = 20;
const MAX_STEPS = 10;

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  // Work on a copy so a failed turn leaves the saved order untouched.
  const state: OrderState = structuredClone(input.state);
  state.turn = (state.turn ?? 0) + 1;
  const recentCustomer = input.history.filter((t) => t.role === "user").slice(-3).map((t) => t.text);
  const ctx: ActionContext = {
    menu: input.menu,
    questions: input.questions,
    now: input.now ?? (() => new Date()),
    state,
    customerSaid: [...recentCustomer, input.userText],
    offerMeals: input.offerMeals ?? false,
  };

  const messages: ModelMessage[] = [
    ...input.history.slice(-MAX_HISTORY_TURNS).map((turn): ModelMessage => ({ role: turn.role, content: turn.text })),
    { role: "user", content: input.userText },
  ];

  const instructions: SystemModelMessage[] = [
    {
      role: "system",
      content: staticInstructions({
        menu: input.menu,
        restaurantName: input.restaurantName,
        upsellEnabled: input.upsellEnabled,
        offerMeals: input.offerMeals ?? false,
        style: input.style,
      }),
      // The menu and rules rarely change, so Anthropic can cache them across turns.
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    { role: "system", content: turnInstructions(ctx, input.channel, input.questions) },
  ];
  const options = {
    model: input.model,
    instructions,
    messages,
    tools: createOrderTools(ctx),
    stopWhen: stepCountIs(MAX_STEPS),
    // Room for several tool calls in one step (each quotes the customer), plus the reply.
    maxOutputTokens: 2000,
  };
  const result = input.onReply ? await streamed(options, input.onReply) : await generateText(options);

  finishTurn(state);
  return {
    reply: result.text.trim() || "Sorry, could you say that again?",
    state,
    toolCalls: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
    toolTrace: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({
        tool: call.toolName,
        input: call.input,
        output: step.toolResults.find((r) => r.toolCallId === call.toolCallId)?.output,
      })),
    ),
  };
}

/** Runs the turn with streamText, passing each step's text on as it arrives. */
async function streamed(options: Parameters<typeof streamText>[0], onReply: (event: ReplyEvent) => void) {
  const stream = streamText(options);
  let stepHasText = false;
  for await (const part of stream.fullStream) {
    if (part.type === "start-step") {
      // The reply is the last step's text; text from an earlier step came before more tool calls.
      if (stepHasText) onReply({ type: "restart" });
      stepHasText = false;
    } else if (part.type === "text-delta" && part.text) {
      stepHasText = true;
      onReply({ type: "text", text: part.text });
    } else if (part.type === "error") {
      throw part.error;
    }
  }
  return { text: await stream.text, steps: await stream.steps };
}
