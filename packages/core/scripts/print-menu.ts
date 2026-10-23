// Prints the demo menu in a readable form: pnpm menu
import { demoMenu, formatPrice, getGroup } from "../src";

const price = (cents: number) => formatPrice(cents, demoMenu.currency);

console.log(`\n${demoMenu.name}\n${"=".repeat(demoMenu.name.length)}`);

for (const category of demoMenu.categories) {
  console.log(`\n${category.name.toUpperCase()}`);
  for (const item of demoMenu.items.filter((i) => i.categoryId === category.id)) {
    const hours = item.availability ? `  [${item.availability.start}–${item.availability.end}]` : "";
    const tags = item.tags.length > 0 ? `  (${item.tags.join(", ")})` : "";
    console.log(`  ${item.name.padEnd(34)} ${price(item.price).padStart(7)}${tags}${hours}`);
    for (const groupId of item.modifierGroupIds) {
      const group = getGroup(demoMenu, groupId);
      if (!group) continue;
      const rule = group.min > 0 ? "required" : "optional";
      const options = group.options
        .map((o) => (o.priceDelta ? `${o.name} +${price(o.priceDelta)}` : o.name) + (o.default ? "*" : ""))
        .join(", ");
      console.log(`      ${group.name} (${rule}): ${options}`);
    }
  }
}
console.log("\n* = default choice\n");
