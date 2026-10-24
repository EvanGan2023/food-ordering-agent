import { tool } from "ai";
import { z } from "zod";
import {
  addItemAction,
  answerQuestionAction,
  cartSummary,
  clearCartAction,
  confirmChangesAction,
  findItemsAction,
  makeMealAction,
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

const said = z
  .string()
  .min(1)
  .describe(
    "The customer's own words for this item and its choices, copied exactly from their message (e.g. \"two cheese burgers no pickles\"). Never rewrite it into menu names. If their words for this item are split up, join the pieces with \" ... \" (e.g. \"Smoky Bacon Deluxe meals ... one with a chocolate thickshake\").",
  );

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
      description:
        "Add an item to the cart. If the customer's words aren't exactly a menu name, nothing is added and the result says to confirm first. If a required choice is missing, the result says what to ask.",
      inputSchema: z.object({
        item_id: z.string(),
        said,
        qty: z.number().int().min(1).max(50).optional(),
        choices,
      }),
      execute: async (input) => addItemAction(ctx, input),
    }),
    update_item: tool({
      description:
        "Change an existing cart line: quantity and/or choices. Groups you send replace that group's choices; other groups stay. Choices the customer didn't name are held for confirmation.",
      inputSchema: z.object({
        line_id: z.string(),
        said: said.describe("The customer's own words for this change, copied exactly from their message."),
        qty: z.number().int().min(1).max(50).optional(),
        choices,
      }),
      execute: async (input) => updateItemAction(ctx, input),
    }),
    confirm_changes: tool({
      description:
        "After you asked the customer to confirm a guessed item or choice: accept=true applies it when they say yes; accept=false drops it.",
      inputSchema: z.object({ accept: z.boolean() }),
      execute: async (input) => confirmChangesAction(ctx, input),
    }),
    make_meal: tool({
      description:
        "Turn a cart line into its meal version after the customer says yes to the meal you offered (or asks for a meal). Choices like 'no pickles' carry over; include any meal choices they named, e.g. the drink.",
      inputSchema: z.object({
        line_id: z.string(),
        said: said.describe("The customer's own words accepting the meal, copied exactly from their message (e.g. \"yes with a lemonade\")."),
        choices,
      }),
      execute: async (input) => makeMealAction(ctx, input),
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
