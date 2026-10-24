// Fills a Square *Sandbox* with a demo menu, so ordering can be tried end to end:
//   pnpm --filter @foa/server square:seed [burger|bubble-tea] [--reset]
// --reset first deletes every item, modifier list and category in the Sandbox catalog.
// Never runs against production.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoMenu, teaMenu } from "@foa/core";
import { createSquareClient, squareConfigFromEnv } from "../src/square/client";
import { fetchCatalog, fetchLocation, menuToCatalog } from "../src/square/catalog";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = squareConfigFromEnv();
if (!config) {
  console.error("Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID (from your Square Sandbox) to .env first.");
  process.exit(1);
}
if (config.environment !== "sandbox") {
  console.error("square:seed only runs against the Sandbox (SQUARE_ENVIRONMENT=sandbox).");
  process.exit(1);
}
const client = createSquareClient(config);
const args = process.argv.slice(2);
const menu = args.includes("bubble-tea") ? teaMenu : demoMenu;

const existing = await fetchCatalog(client);
if (existing.length && !args.includes("--reset")) {
  console.error(`The Sandbox catalog already has ${existing.length} objects. Run again with --reset to replace them.`);
  process.exit(1);
}
for (let i = 0; i < existing.length; i += 200) {
  await client.request("POST", "/v2/catalog/batch-delete", { object_ids: existing.slice(i, i + 200).map((o) => o.id) });
}
if (existing.length) console.log(`Deleted ${existing.length} catalog objects.`);

const location = await fetchLocation(client);
const currency = location.currency ?? menu.currency;
if (currency !== menu.currency) console.log(`Note: the Sandbox location uses ${currency}; prices are kept as numbers (${menu.currency} in the demo).`);
const objects = menuToCatalog(menu, currency);
const result = await client.request<{ objects?: unknown[] }>("POST", "/v2/catalog/batch-upsert", {
  idempotency_key: randomUUID(),
  batches: [{ objects }],
});
console.log(`Added ${menu.name}: ${result.objects?.length ?? 0} catalog objects (${menu.items.length} items) to ${location.name ?? config.locationId}.`);
console.log("Set MENU_SOURCE=square in .env and restart pnpm dev to order from it.");
