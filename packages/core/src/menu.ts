import type { Menu, MenuItem, ModifierGroup } from "./schema";

export function getItem(menu: Menu, itemId: string): MenuItem | undefined {
  return menu.items.find((item) => item.id === itemId);
}

export function getGroup(menu: Menu, groupId: string): ModifierGroup | undefined {
  return menu.modifierGroups.find((group) => group.id === groupId);
}

/** Current local time in the menu's timezone, as HH:MM. */
export function localTime(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/**
 * Checks a parsed menu for broken references that the schema alone can't catch.
 * Returns a list of problems; an empty list means the menu is usable.
 */
export function validateMenu(menu: Menu): string[] {
  const problems: string[] = [];
  const categoryIds = new Set(menu.categories.map((c) => c.id));
  const groupIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const group of menu.modifierGroups) {
    if (groupIds.has(group.id)) problems.push(`duplicate modifier group id "${group.id}"`);
    groupIds.add(group.id);

    if (group.min > group.max) problems.push(`group "${group.id}": min ${group.min} > max ${group.max}`);
    if (group.min > group.options.length) {
      problems.push(`group "${group.id}": min ${group.min} > ${group.options.length} options`);
    }

    const optionIds = new Set<string>();
    for (const option of group.options) {
      if (optionIds.has(option.id)) problems.push(`group "${group.id}": duplicate option id "${option.id}"`);
      optionIds.add(option.id);
    }

    const defaults = group.options.filter((o) => o.default).length;
    if (defaults > group.max) problems.push(`group "${group.id}": ${defaults} defaults > max ${group.max}`);
  }

  for (const item of menu.items) {
    if (itemIds.has(item.id)) problems.push(`duplicate item id "${item.id}"`);
    itemIds.add(item.id);

    if (!categoryIds.has(item.categoryId)) {
      problems.push(`item "${item.id}": unknown category "${item.categoryId}"`);
    }
    for (const groupId of item.modifierGroupIds) {
      if (!groupIds.has(groupId)) problems.push(`item "${item.id}": unknown modifier group "${groupId}"`);
    }
    if (item.availability && item.availability.start >= item.availability.end) {
      problems.push(`item "${item.id}": availability start must be before end`);
    }
  }

  for (const category of menu.categories) {
    if (!menu.items.some((item) => item.categoryId === category.id)) {
      problems.push(`category "${category.id}" has no items`);
    }
  }

  return problems;
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);
}
