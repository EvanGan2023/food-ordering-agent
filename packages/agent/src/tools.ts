import { tool } from "ai";
import { z } from "zod";
import {
  addItemAction,
  answerQuestionAction,
  cartSummary,
  clearCartAction,
  findItemsAction,
  questionStatus,
  removeItemAction,
  updateItemAction,
  type ActionContext,
} from "./actions";

const choices = z
  .array(
    z.object({
      group_id: z.string().describe("Choice group id from the menu, e.g. meal-drink"),
      option_ids: z.array(z.string()).describe("Chosen option ids in that group"),
    }),
  )
  .optional()
  .describe("Only the groups the customer specified; defaults fill the rest.");

/** The only way the model can touch the order. Every call is checked against the menu. */
export function createOrderTools(ctx: ActionContext) {
  return {
    find_items: tool({
      description:
        "Search the menu by what the customer said. Returns item ids, prices, choice groups and menu-listed allergens.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => findItemsAction(ctx, query),
    }),
    add_item: tool({
      description: "Add an item to the cart. If a required choice is missing, the result says what to ask.",
      inputSchema: z.object({
        item_id: z.string(),
        qty: z.number().int().min(1).max(50).optional(),
        choices,
      }),
      execute: async (input) => addItemAction(ctx, input),
    }),
    update_item: tool({
      description:
        "Change an existing cart line: quantity and/or choices. Groups you send replace that group's choices; other groups stay.",
      inputSchema: z.object({
        line_id: z.string(),
        qty: z.number().int().min(1).max(50).optional(),
        choices,
      }),
      execute: async (input) => updateItemAction(ctx, input),
    }),
    remove_item: tool({
      description: "Remove a line from the cart.",
      inputSchema: z.object({ line_id: z.string() }),
      execute: async ({ line_id }) => removeItemAction(ctx, line_id),
    }),
    clear_cart: tool({
      description: "Empty the cart when the customer wants to start over.",
      inputSchema: z.object({}),
      execute: async () => clearCartAction(ctx),
    }),
    get_cart: tool({
      description: "Read the current cart with line ids and prices.",
      inputSchema: z.object({}),
      execute: async () => cartSummary(ctx),
    }),
    get_questions: tool({
      description: "List the restaurant's order questions and which are answered.",
      inputSchema: z.object({}),
      execute: async () => questionStatus(ctx),
    }),
    answer_question: tool({
      description: "Save the customer's answer to one of the restaurant's order questions.",
      inputSchema: z.object({ question_id: z.string(), answer: z.string() }),
      execute: async (input) => answerQuestionAction(ctx, input),
    }),
  };
}
