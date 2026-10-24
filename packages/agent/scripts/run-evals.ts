// Grades the real LLM agent on the sample orders: pnpm --filter @foa/agent eval [burger|bubble-tea]
// EVAL_VERBOSE=1 also prints every conversation transcript.
// Needs an API key in the repo's .env (see .env.example).
// - orders: one customer message; the cart must match exactly.
// - confirmations: misheard orders; nothing guessed may be added before the customer says yes.
// - conversations: several messages; after each, the cart, the choices asked and the offers made are checked.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoMenu, getItem, questionsFor, resolveSelections, teaMenu, type AddItemInput, type Menu } from "@foa/core";
import burgerEvals from "../../../evals/demo-orders.json";
import teaEvals from "../../../evals/tea-orders.json";
import { createModel, modelConfigFromEnv, newOrderState, runAgent, type ChatTurn, type OrderState } from "../src";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = modelConfigFromEnv();
if (!config) {
  console.error("No API key found. Add ANTHROPIC_API_KEY (or another provider's key) to .env.");
  process.exit(1);
}
const model = createModel(config);
const DEFAULT_TIME = "2026-07-15T04:00:00Z";
/** Cases run a few at a time; each one is still a separate conversation. */
const CONCURRENCY = 4;
/** EVAL_VERBOSE=1 prints every conversation, not just failures. */
const VERBOSE = process.env.EVAL_VERBOSE === "1";

interface Expect {
  cart?: AddItemInput[];
  asks?: string[];
  offers?: string[];
  replyMentions?: string[];
  /** Regexes the reply must not match, e.g. prices nobody asked for. */
  replyAvoids?: string[];
  maxReplyWords?: number;
}
interface EvalSet {
  name: string;
  key: string;
  menu: Menu;
  orders: { id: string; utterance: string; lines: AddItemInput[]; at?: string }[];
  confirmations: { id: string; turns: string[]; lines: AddItemInput[] }[];
  conversations: { id: string; turns: { say: string; expect: Expect }[] }[];
}

const sets: EvalSet[] = [
  { name: "Patty & Co. (burgers)", key: "burger", menu: demoMenu, ...(burgerEvals as Omit<EvalSet, "name" | "key" | "menu">) },
  {
    name: "Bramble Tea (bubble tea)",
    key: "bubble-tea",
    menu: teaMenu,
    confirmations: [],
    ...(teaEvals as Omit<EvalSet, "name" | "key" | "menu" | "confirmations">),
  },
];

/** Canonical form of a cart line with defaults applied, so equivalent carts compare equal. */
function canonical(menu: Menu, line: AddItemInput): string {
  const item = getItem(menu, line.itemId);
  const resolved = item ? resolveSelections(menu, item, line.modifiers) : null;
  const modifiers = resolved?.ok ? resolved.value : (line.modifiers ?? {});
  const sorted = Object.keys(modifiers)
    .sort()
    .map((group) => `${group}=${[...(modifiers[group] ?? [])].sort().join("+")}`)
    .join(",");
  return `${line.qty ?? 1}x ${line.itemId} [${sorted}]`;
}

const cartText = (menu: Menu, lines: AddItemInput[]) => lines.map((l) => canonical(menu, l)).sort();
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** One customer message through the agent, the way the server runs it. */
async function turn(menu: Menu, state: OrderState, history: ChatTurn[], text: string, at = DEFAULT_TIME) {
  const result = await runAgent({
    model,
    menu,
    restaurantName: menu.name.replace(/\s*\(demo\)$/, ""),
    upsellEnabled: false,
    offerMeals: true,
    channel: "kiosk",
    // Grade ordering only; owner questions are tested separately.
    questions: questionsFor([], "kiosk"),
    state,
    history,
    userText: text,
    now: () => new Date(at),
  });
  history.push({ role: "user", text }, { role: "assistant", text: result.reply });
  return result;
}

interface Outcome {
  ok: boolean;
  label: string;
  log: string[];
}

async function pool<T>(items: T[], run: (item: T) => Promise<Outcome>): Promise<Outcome[]> {
  const results: Outcome[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = await run(items[index]!);
        } catch (err) {
          results[index] = { ok: false, label: `case ${index}`, log: [`  error: ${(err as Error).message}`] };
        }
      }
    }),
  );
  return results;
}

async function gradeOrder(set: EvalSet, order: EvalSet["orders"][number]): Promise<Outcome> {
  const t0 = Date.now();
  const result = await turn(set.menu, newOrderState(), [], order.utterance, order.at);
  const got = cartText(set.menu, result.state.cart.lines);
  const want = cartText(set.menu, order.lines);
  const ok = same(got, want);
  return {
    ok,
    label: `${order.id} (${Date.now() - t0} ms) "${order.utterance}"`,
    log: ok
      ? []
      : [
          `  want: ${want.join(" | ")}`,
          `  got:  ${got.join(" | ") || "(empty)"}`,
          ...result.toolTrace.map((t) => `    ${t.tool} ${JSON.stringify(t.input)} → ${JSON.stringify(t.output).slice(0, 300)}`),
          `  reply: ${result.reply}`,
        ],
  };
}

async function gradeConfirmation(set: EvalSet, c: EvalSet["confirmations"][number]): Promise<Outcome> {
  const want = cartText(set.menu, c.lines);
  let state = newOrderState();
  const history: ChatTurn[] = [];
  const log: string[] = [];
  let ok = true;
  for (const [index, text] of c.turns.entries()) {
    const result = await turn(set.menu, state, history, text);
    state = result.state;
    const got = cartText(set.menu, state.cart.lines);
    log.push(
      `  customer: ${text}`,
      ...result.toolTrace.map((t) => `    ${t.tool} ${JSON.stringify(t.input)} → ${JSON.stringify(t.output).slice(0, 300)}`),
      `  agent:    ${result.reply}`,
      `  cart:     ${got.join(" | ") || "(empty)"}`,
    );
    // Every expected line the customer didn't name exactly must still be held, not in the cart.
    if (index === 0 && (!state.pendingConfirm || want.every((line) => got.includes(line)))) ok = false;
  }
  if (!same(cartText(set.menu, state.cart.lines), want)) ok = false;
  return { ok, label: `${c.id} confirm before adding: "${c.turns[0]}"`, log: ok ? [] : [`  want after confirming: ${want.join(" | ")}`, ...log] };
}

async function gradeConversation(set: EvalSet, c: EvalSet["conversations"][number]): Promise<Outcome> {
  let state = newOrderState();
  const history: ChatTurn[] = [];
  const log: string[] = [];
  let ok = true;
  for (const { say, expect } of c.turns) {
    const result = await turn(set.menu, state, history, say);
    state = result.state;
    const got = cartText(set.menu, state.cart.lines);
    const asks = state.pendingChoice?.groups.map((g) => g.groupId) ?? [];
    const offers = (state.pendingOffers ?? []).flatMap((o) => [...(o.meal ? ["meal"] : []), ...o.groups.map((g) => g.groupId)]);
    const problems = [
      expect.cart && !same(got, cartText(set.menu, expect.cart)) ? `cart should be ${cartText(set.menu, expect.cart).join(" | ") || "(empty)"}` : "",
      expect.asks && !same(asks, expect.asks) ? `should ask for [${expect.asks.join(", ")}], asked [${asks.join(", ")}]` : "",
      expect.offers && !same([...new Set(offers)], expect.offers) ? `should offer [${expect.offers.join(", ")}], offered [${offers.join(", ")}]` : "",
      ...(expect.replyMentions ?? []).filter((re) => !new RegExp(re, "i").test(result.reply)).map((re) => `reply should mention /${re}/`),
      ...(expect.replyAvoids ?? []).filter((re) => new RegExp(re, "i").test(result.reply)).map((re) => `reply should not match /${re}/`),
      expect.maxReplyWords && result.reply.split(/\s+/).length > expect.maxReplyWords
        ? `reply should be at most ${expect.maxReplyWords} words, was ${result.reply.split(/\s+/).length}`
        : "",
    ].filter(Boolean);
    if (problems.length) ok = false;
    log.push(
      `  customer: ${say}`,
      ...result.toolTrace.map((t) => `    ${t.tool} ${JSON.stringify(t.input)} → ${JSON.stringify(t.output).slice(0, 300)}`),
      `  agent:    ${result.reply}`,
      `  cart:     ${got.join(" | ") || "(empty)"}`,
      ...problems.map((p) => `  ✗ ${p}`),
    );
  }
  return { ok, label: `${c.id} conversation: "${c.turns.map((t) => t.say).join('" → "')}"`, log: ok && !VERBOSE ? [] : log };
}

const only = process.argv[2];
const chosen = sets.filter((s) => !only || s.key === only);
if (chosen.length === 0) {
  console.error(`Unknown set "${only}". Use one of: ${sets.map((s) => s.key).join(", ")}.`);
  process.exit(1);
}

const started = Date.now();
const summary: string[] = [];
let allOk = true;
for (const set of chosen) {
  console.log(`\n# ${set.name}`);
  const groups: [string, Outcome[]][] = [
    ["orders correct", await pool(set.orders, (o) => gradeOrder(set, o))],
    ["misheard orders confirmed before adding", await pool(set.confirmations, (c) => gradeConfirmation(set, c))],
    ["conversations right at every step", await pool(set.conversations, (c) => gradeConversation(set, c))],
  ];
  for (const [title, outcomes] of groups) {
    if (outcomes.length === 0) continue;
    for (const o of outcomes) {
      console.log(`${o.ok ? "PASS" : "FAIL"} ${o.label}`);
      if (o.log.length) console.log(o.log.join("\n"));
    }
    const passed = outcomes.filter((o) => o.ok).length;
    if (passed < outcomes.length) allOk = false;
    summary.push(`${set.name}: ${passed}/${outcomes.length} ${title}`);
  }
}

console.log(`\n${summary.join("\n")}`);
console.log(`${Math.round((Date.now() - started) / 1000)} s total`);
process.exit(allOk ? 0 : 1);
