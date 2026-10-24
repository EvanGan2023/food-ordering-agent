import { z } from "zod";

// All prices are integers in the menu currency's minor unit (cents).

export const ModifierOption = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceDelta: z.number().int().default(0),
  default: z.boolean().default(false),
});

export const ModifierGroup = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  min: z.number().int().min(0),
  max: z.number().int().min(1),
  options: z.array(ModifierOption).min(1),
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

export const Availability = z.object({
  start: clock,
  end: clock,
});

export const MenuItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(""),
  categoryId: z.string().min(1),
  price: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  // Allergen data comes only from the menu. The agent must never invent it.
  allergens: z.array(z.string()).default([]),
  modifierGroupIds: z.array(z.string()).default([]),
  inStock: z.boolean().default(true),
  availability: Availability.optional(),
});

export const Category = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const Menu = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  categories: z.array(Category),
  modifierGroups: z.array(ModifierGroup),
  items: z.array(MenuItem),
});

// Selected option ids per modifier group id.
export const Selections = z.record(z.string(), z.array(z.string()));

export const CartLine = z.object({
  lineId: z.string(),
  itemId: z.string(),
  qty: z.number().int().min(1),
  modifiers: Selections,
});

export const Cart = z.object({
  lines: z.array(CartLine),
});

export type ModifierOption = z.infer<typeof ModifierOption>;
export type ModifierGroup = z.infer<typeof ModifierGroup>;
export type Availability = z.infer<typeof Availability>;
export type MenuItem = z.infer<typeof MenuItem>;
export type Category = z.infer<typeof Category>;
export type Menu = z.infer<typeof Menu>;
export type MenuInput = z.input<typeof Menu>;
export type Selections = z.infer<typeof Selections>;
export type CartLine = z.infer<typeof CartLine>;
export type Cart = z.infer<typeof Cart>;
