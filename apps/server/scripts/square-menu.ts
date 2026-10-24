// Shows the restaurant's Square catalog as the agent's menu: pnpm --filter @foa/server square:menu [--json]
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatPrice } from "@foa/core";
import { createSquareClient, squareConfigFromEnv } from "../src/square/client";
import { loadSquareMenu } from "../src/square/catalog";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = squareConfigFromEnv();
if (!config) {
  console.error("Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to .env first.");
  process.exit(1);
}
const { menu, skipped } = await loadSquareMenu(createSquareClient(config));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(menu, null, 2));
} else {
  console.log(`${menu.name} (${menu.currency}, ${menu.timezone}): ${menu.items.length} items`);
  for (const category of menu.categories) {
    console.log(`\n${category.name}`);
    for (const item of menu.items.filter((i) => i.categoryId === category.id)) {
      const groups = item.modifierGroupIds.map((id) => menu.modifierGroups.find((g) => g.id === id)!);
      console.log(`  ${item.name}  ${formatPrice(item.price, menu.currency)}${item.inStock ? "" : "  (sold out)"}`);
      for (const g of groups) console.log(`    ${g.name} [${g.min}-${g.max}]: ${g.options.map((o) => o.name).join(", ")}`);
    }
  }
  for (const s of skipped) console.log(`skipped ${s}`);
}
