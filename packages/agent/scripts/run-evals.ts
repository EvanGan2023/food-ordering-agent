// Grades the real LLM agent on the demo order set: pnpm --filter @foa/agent eval
// Needs an API key in the repo's .env (see .env.example). Each case is one customer message;
// the cart the agent builds must match the expected cart exactly.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoMenu, questionsFor, resolveSelections, getItem, type AddItemInput } from "@foa/core";
import evals from "../../../evals/demo-orders.json";
import { createModel, modelConfigFromEnv, newOrderState, runAgent } from "../src";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = modelConfigFromEnv();
if (!config) {
  console.error("No API key found. Add ANTHROPIC_API_KEY (or another provider's key) to .env.");
  process.exit(1);
}
const model = createModel(config);
const DEFAULT_TIME = "2026-07-15T04:00:00Z";

/** Canonical form of a cart line with defaults applied, so equivalent carts compare equal. */
function canonical(line: AddItemInput): string {
  const item = getItem(demoMenu, line.itemId);
  const resolved = item ? resolveSelections(demoMenu, item, line.modifiers) : null;
  const modifiers = resolved?.ok ? resolved.value : (line.modifiers ?? {});
  const sorted = Object.keys(modifiers)
    .sort()
    .map((group) => `${group}=${[...(modifiers[group] ?? [])].sort().join("+")}`)
    .join(",");
  return `${line.qty ?? 1}x ${line.itemId} [${sorted}]`;
}

const sortedLines = (lines: AddItemInput[]) => lines.map(canonical).sort();

let passed = 0;
const started = Date.now();
for (const order of evals.orders) {
  const at = new Date(("at" in order && order.at) || DEFAULT_TIME);
  const t0 = Date.now();
  try {
    const result = await runAgent({
      model,
      menu: demoMenu,
      restaurantName: "Patty & Co.",
      upsellEnabled: false,
      channel: "kiosk",
      // Grade ordering only; owner questions are tested separately.
      questions: questionsFor([], "kiosk"),
      state: newOrderState(),
      history: [],
      userText: order.utterance,
      now: () => at,
    });
    const got = sortedLines(result.state.cart.lines);
    const want = sortedLines(order.lines as AddItemInput[]);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) passed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${order.id} (${Date.now() - t0} ms) "${order.utterance}"`);
    if (!ok) {
      console.log(`  want: ${want.join(" | ")}`);
      console.log(`  got:  ${got.join(" | ") || "(empty)"}`);
      console.log(`  reply: ${result.reply}`);
    }
  } catch (err) {
    console.log(`ERROR ${order.id}: ${(err as Error).message}`);
  }
}

const total = evals.orders.length;
console.log(`\n${passed}/${total} orders correct (${Math.round((passed / total) * 100)}%), ${Math.round((Date.now() - started) / 1000)} s total`);
process.exit(passed === total ? 0 : 1);
