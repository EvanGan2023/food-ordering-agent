import { generateText, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import type { Channel, Menu, OrderQuestion } from "@foa/core";
import type { ActionContext, OrderState } from "./actions";
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
  channel: Channel;
  /** Owner questions for this channel. */
  questions: OrderQuestion[];
  state: OrderState;
  /** Earlier turns, oldest first. The cart itself is always taken from `state`. */
  history: ChatTurn[];
  userText: string;
  now?: () => Date;
}

export interface RunAgentResult {
  reply: string;
  state: OrderState;
  toolCalls: string[];
}

const MAX_HISTORY_TURNS = 20;
const MAX_STEPS = 10;

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  // Work on a copy so a failed turn leaves the saved order untouched.
  const state: OrderState = structuredClone(input.state);
  const ctx: ActionContext = {
    menu: input.menu,
    questions: input.questions,
    now: input.now ?? (() => new Date()),
    state,
  };

  const messages: ModelMessage[] = [
    ...input.history.slice(-MAX_HISTORY_TURNS).map((turn): ModelMessage => ({ role: turn.role, content: turn.text })),
    { role: "user", content: input.userText },
  ];

  const result = await generateText({
    model: input.model,
    instructions: [
      {
        role: "system",
        content: staticInstructions({
          menu: input.menu,
          restaurantName: input.restaurantName,
          upsellEnabled: input.upsellEnabled,
        }),
        // The menu and rules rarely change, so Anthropic can cache them across turns.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "system", content: turnInstructions(ctx, input.channel, input.questions) },
    ],
    messages,
    tools: createOrderTools(ctx),
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 600,
    temperature: 0,
  });

  return {
    reply: result.text.trim() || "Sorry, could you say that again?",
    state,
    toolCalls: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
  };
}
