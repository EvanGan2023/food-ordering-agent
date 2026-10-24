import { formatPrice, getGroup, getItem, localTime } from "./menu";
import type { Availability, Cart, CartLine, Menu, MenuItem, ModifierGroup, Selections } from "./schema";

export const MAX_QTY = 50;

export interface ChoiceOption {
  id: string;
  name: string;
  priceDelta: number;
}

/** A choice group the customer still has to pick from. */
export interface ChoiceGroup {
  groupId: string;
  groupName: string;
  min: number;
  max: number;
  options: ChoiceOption[];
}

export type CartError =
  | { code: "unknown_item"; itemId: string }
  | { code: "out_of_stock"; itemId: string; name: string }
  | { code: "unavailable_now"; itemId: string; name: string; availability: Availability }
  | { code: "unknown_modifier_group"; itemId: string; groupId: string }
  | { code: "invalid_option"; groupId: string; optionId: string }
  /** Every required group still unpicked, so all of them can be asked in one question. */
  | { code: "missing_choice"; itemId: string; groups: ChoiceGroup[] }
  | { code: "too_many_choices"; groupId: string; max: number }
  | { code: "invalid_quantity"; qty: number }
  | { code: "unknown_line"; lineId: string }
  | { code: "empty_cart" };

export type Result<T> = { ok: true; value: T } | { ok: false; error: CartError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: CartError): Result<T> => ({ ok: false, error });

export const emptyCart = (): Cart => ({ lines: [] });

export function checkAvailable(menu: Menu, item: MenuItem, now: Date): CartError | null {
  if (!item.inStock) return { code: "out_of_stock", itemId: item.id, name: item.name };
  if (item.availability) {
    const time = localTime(now, menu.timezone);
    const { start, end } = item.availability;
    if (time < start || time >= end) {
      return { code: "unavailable_now", itemId: item.id, name: item.name, availability: item.availability };
    }
  }
  return null;
}

/**
 * Applies defaults and checks every modifier group of an item.
 * Groups the customer didn't mention fall back to their default options;
 * required groups with no default come back together as `missing_choice` so the agent can ask once.
 */
export function resolveSelections(menu: Menu, item: MenuItem, requested: Selections = {}): Result<Selections> {
  for (const groupId of Object.keys(requested)) {
    if (!item.modifierGroupIds.includes(groupId)) {
      return fail({ code: "unknown_modifier_group", itemId: item.id, groupId });
    }
  }

  const resolved: Selections = {};
  const missing: ChoiceGroup[] = [];
  for (const groupId of item.modifierGroupIds) {
    const group = getGroup(menu, groupId);
    if (!group) return fail({ code: "unknown_modifier_group", itemId: item.id, groupId });

    const asked = requested[groupId];
    const chosen = asked ? [...new Set(asked)] : group.options.filter((o) => o.default).map((o) => o.id);

    for (const optionId of chosen) {
      if (!group.options.some((o) => o.id === optionId)) {
        return fail({ code: "invalid_option", groupId, optionId });
      }
    }
    if (chosen.length < group.min) {
      missing.push(choiceGroup(group));
      continue;
    }
    if (chosen.length > group.max) return fail({ code: "too_many_choices", groupId, max: group.max });
    if (chosen.length > 0) resolved[groupId] = chosen;
  }
  if (missing.length) return fail({ code: "missing_choice", itemId: item.id, groups: missing });
  return ok(resolved);
}

export function choiceGroup(group: ModifierGroup): ChoiceGroup {
  return {
    groupId: group.id,
    groupName: group.name,
    min: group.min,
    max: group.max,
    options: group.options.map(({ id, name, priceDelta }) => ({ id, name, priceDelta })),
  };
}

function checkQty(qty: number): CartError | null {
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY ? null : { code: "invalid_quantity", qty };
}

function nextLineId(cart: Cart): string {
  const highest = cart.lines.reduce((max, line) => Math.max(max, Number(line.lineId.slice(1)) || 0), 0);
  return `l${highest + 1}`;
}

export interface AddItemInput {
  itemId: string;
  qty?: number;
  modifiers?: Selections;
}

export function addItem(
  cart: Cart,
  menu: Menu,
  input: AddItemInput,
  now: Date = new Date(),
): Result<{ cart: Cart; line: CartLine }> {
  const qty = input.qty ?? 1;
  const badQty = checkQty(qty);
  if (badQty) return fail(badQty);

  const item = getItem(menu, input.itemId);
  if (!item) return fail({ code: "unknown_item", itemId: input.itemId });

  const unavailable = checkAvailable(menu, item, now);
  if (unavailable) return fail(unavailable);

  const selections = resolveSelections(menu, item, input.modifiers);
  if (!selections.ok) return fail(selections.error);

  const line: CartLine = { lineId: nextLineId(cart), itemId: item.id, qty, modifiers: selections.value };
  return ok({ cart: { lines: [...cart.lines, line] }, line });
}

export interface UpdateItemInput {
  qty?: number;
  /** Groups listed here replace the line's current choices for that group; other groups are kept. */
  modifiers?: Selections;
}

export function updateItem(
  cart: Cart,
  menu: Menu,
  lineId: string,
  changes: UpdateItemInput,
): Result<{ cart: Cart; line: CartLine }> {
  const current = cart.lines.find((line) => line.lineId === lineId);
  if (!current) return fail({ code: "unknown_line", lineId });

  const qty = changes.qty ?? current.qty;
  const badQty = checkQty(qty);
  if (badQty) return fail(badQty);

  const item = getItem(menu, current.itemId);
  if (!item) return fail({ code: "unknown_item", itemId: current.itemId });

  const selections = resolveSelections(menu, item, { ...current.modifiers, ...changes.modifiers });
  if (!selections.ok) return fail(selections.error);

  const line: CartLine = { ...current, qty, modifiers: selections.value };
  return ok({ cart: { lines: cart.lines.map((l) => (l.lineId === lineId ? line : l)) }, line });
}

export function removeItem(cart: Cart, lineId: string): Result<{ cart: Cart }> {
  if (!cart.lines.some((line) => line.lineId === lineId)) return fail({ code: "unknown_line", lineId });
  return ok({ cart: { lines: cart.lines.filter((line) => line.lineId !== lineId) } });
}

export interface PricedLine extends CartLine {
  name: string;
  /** Names of the chosen options, e.g. ["Large", "No pickles"]. */
  options: string[];
  unitPrice: number;
  lineTotal: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  currency: string;
}

/** Prices a cart from menu data only. Throws if the cart references things not on the menu. */
export function priceCart(cart: Cart, menu: Menu): PricedCart {
  const lines = cart.lines.map((line): PricedLine => {
    const item = getItem(menu, line.itemId);
    if (!item) throw new Error(`unknown item "${line.itemId}" in cart`);

    let unitPrice = item.price;
    const options: string[] = [];
    for (const [groupId, optionIds] of Object.entries(line.modifiers)) {
      const group = getGroup(menu, groupId);
      if (!group) throw new Error(`unknown modifier group "${groupId}" in cart`);
      for (const optionId of optionIds) {
        const option = group.options.find((o) => o.id === optionId);
        if (!option) throw new Error(`unknown option "${optionId}" in group "${groupId}"`);
        unitPrice += option.priceDelta;
        options.push(option.name);
      }
    }
    return { ...line, name: item.name, options, unitPrice, lineTotal: unitPrice * line.qty };
  });

  return { lines, subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0), currency: menu.currency };
}

/** Re-checks every line against the current menu before payment. */
export function validateForCheckout(cart: Cart, menu: Menu, now: Date = new Date()): Result<PricedCart> {
  if (cart.lines.length === 0) return fail({ code: "empty_cart" });
  for (const line of cart.lines) {
    const item = getItem(menu, line.itemId);
    if (!item) return fail({ code: "unknown_item", itemId: line.itemId });
    const unavailable = checkAvailable(menu, item, now);
    if (unavailable) return fail(unavailable);
    const selections = resolveSelections(menu, item, line.modifiers);
    if (!selections.ok) return fail(selections.error);
  }
  return ok(priceCart(cart, menu));
}

/** Human-readable cart, one line per item, for read-backs and logs. */
export function describeCart(priced: PricedCart): string[] {
  const lines = priced.lines.map((line) => {
    const options = line.options.length > 0 ? ` (${line.options.join(", ")})` : "";
    return `${line.qty} × ${line.name}${options}: ${formatPrice(line.lineTotal, priced.currency)}`;
  });
  return [...lines, `Subtotal: ${formatPrice(priced.subtotal, priced.currency)}`];
}
