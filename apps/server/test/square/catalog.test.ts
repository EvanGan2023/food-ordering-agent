import { describe, expect, it } from "vitest";
import { demoMenu, teaMenu, validateMenu } from "@foa/core";
import { catalogToMenu, menuToCatalog, slug, type CatalogObject } from "../../src/square/catalog";

const location = { id: "LOC1", business_name: "Corner Cafe", timezone: "Australia/Melbourne", currency: "AUD" };
const money = (amount: number) => ({ amount, currency: "AUD" });

const catalog: CatalogObject[] = [
  { type: "CATEGORY", id: "CAT_DRINKS", category_data: { name: "Drinks" } },
  {
    type: "MODIFIER_LIST",
    id: "ML_MILK",
    modifier_list_data: {
      name: "Milk",
      selection_type: "SINGLE",
      modifiers: [
        { type: "MODIFIER", id: "MOD_FULL", modifier_data: { name: "Full cream", price_money: money(0), on_by_default: true } },
        { type: "MODIFIER", id: "MOD_OAT", modifier_data: { name: "Oat", price_money: money(70) } },
        {
          type: "MODIFIER",
          id: "MOD_SOY",
          modifier_data: { name: "Soy", price_money: money(50), location_overrides: [{ location_id: "LOC1", sold_out: true }] },
        },
      ],
    },
  },
  {
    type: "MODIFIER_LIST",
    id: "ML_EXTRAS",
    modifier_list_data: {
      name: "Extras",
      selection_type: "MULTIPLE",
      modifiers: [
        { type: "MODIFIER", id: "MOD_SHOT", modifier_data: { name: "Extra shot", price_money: money(60) } },
        { type: "MODIFIER", id: "MOD_SYRUP", modifier_data: { name: "Vanilla syrup", price_money: money(60) } },
      ],
    },
  },
  {
    type: "ITEM",
    id: "ITEM_LATTE",
    item_data: {
      name: "Latte",
      categories: [{ id: "CAT_DRINKS" }],
      variations: [
        { type: "ITEM_VARIATION", id: "VAR_LATTE_S", item_variation_data: { name: "Small", pricing_type: "FIXED_PRICING", price_money: money(450) } },
        { type: "ITEM_VARIATION", id: "VAR_LATTE_L", item_variation_data: { name: "Large", pricing_type: "FIXED_PRICING", price_money: money(550) } },
      ],
      modifier_list_info: [
        { modifier_list_id: "ML_MILK", min_selected_modifiers: 1, max_selected_modifiers: 1 },
        { modifier_list_id: "ML_EXTRAS", min_selected_modifiers: -1, max_selected_modifiers: -1 },
      ],
    },
  },
  {
    type: "ITEM",
    id: "ITEM_MUFFIN",
    item_data: {
      name: "Blueberry Muffin",
      variations: [{ type: "ITEM_VARIATION", id: "VAR_MUFFIN", item_variation_data: { name: "Regular", pricing_type: "FIXED_PRICING", price_money: money(500) } }],
    },
  },
  {
    type: "ITEM",
    id: "ITEM_CATERING",
    item_data: {
      name: "Catering Platter",
      variations: [{ type: "ITEM_VARIATION", id: "VAR_CATERING", item_variation_data: { name: "Regular", pricing_type: "VARIABLE_PRICING" } }],
    },
  },
  {
    type: "ITEM",
    id: "ITEM_ELSEWHERE",
    present_at_all_locations: false,
    present_at_location_ids: ["LOC2"],
    item_data: {
      name: "City Special",
      variations: [{ type: "ITEM_VARIATION", id: "VAR_ELSEWHERE", item_variation_data: { pricing_type: "FIXED_PRICING", price_money: money(900) } }],
    },
  },
  { type: "ITEM", id: "ITEM_GONE", is_deleted: true, item_data: { name: "Old Thing", variations: [] } },
];

describe("catalogToMenu", () => {
  const { menu, skipped } = catalogToMenu(catalog, location);

  it("builds a valid menu for the location", () => {
    expect(validateMenu(menu)).toEqual([]);
    expect(menu).toMatchObject({ id: "corner-cafe", name: "Corner Cafe", currency: "AUD", timezone: "Australia/Melbourne" });
    expect(menu.items.map((i) => i.name)).toEqual(["Latte", "Blueberry Muffin"]);
    expect(skipped).toEqual(["Catering Platter: no fixed price at this location"]);
  });

  it("turns several variations into a pick-one size group priced from the cheapest", () => {
    const latte = menu.items.find((i) => i.id === "latte")!;
    expect(latte).toMatchObject({ price: 450, categoryId: "drinks", posId: undefined });
    const size = menu.modifierGroups.find((g) => g.id === latte.modifierGroupIds[0])!;
    expect(size).toMatchObject({ name: "Size", min: 1, max: 1, posVariations: true });
    expect(size.options.map((o) => [o.name, o.priceDelta, o.posId])).toEqual([
      ["Small", 0, "VAR_LATTE_S"],
      ["Large", 100, "VAR_LATTE_L"],
    ]);
  });

  it("keeps a single variation's id on the item and puts it in Other without a category", () => {
    expect(menu.items.find((i) => i.id === "blueberry-muffin")).toMatchObject({ price: 500, posId: "VAR_MUFFIN", categoryId: "other" });
  });

  it("maps modifier lists with per-item limits, defaults and sold-out options", () => {
    const latte = menu.items.find((i) => i.id === "latte")!;
    const [, milk, extras] = latte.modifierGroupIds.map((id) => menu.modifierGroups.find((g) => g.id === id)!);
    expect(milk).toMatchObject({ name: "Milk", min: 1, max: 1 });
    expect(milk!.options.map((o) => [o.name, o.priceDelta, o.default, o.posId])).toEqual([
      ["Full cream", 0, true, "MOD_FULL"],
      ["Oat", 70, false, "MOD_OAT"],
    ]);
    expect(extras).toMatchObject({ name: "Extras", min: 0, max: 2 });
  });
});

describe("taxes", () => {
  const withTax = (tax: CatalogObject["tax_data"], taxIds = ["TAX"]) =>
    catalogToMenu(
      [
        { type: "TAX", id: "TAX", tax_data: { name: "Tax", ...tax } },
        ...catalog.map((o) => (o.id === "ITEM_MUFFIN" ? { ...o, item_data: { ...o.item_data, tax_ids: taxIds } } : o)),
      ],
      location,
    ).menu.taxAddedAtCheckout;

  it("notes when the location adds tax on top of an item's price", () => {
    expect(withTax({ inclusion_type: "ADDITIVE", enabled: true })).toBe(true);
  });

  it("leaves prices as they are when tax is included, turned off or on no item", () => {
    expect(catalogToMenu(catalog, location).menu.taxAddedAtCheckout).toBe(false);
    expect(withTax({ inclusion_type: "INCLUSIVE", enabled: true })).toBe(false);
    expect(withTax({ inclusion_type: "ADDITIVE", enabled: false })).toBe(false);
    expect(withTax({ inclusion_type: "ADDITIVE", enabled: true }, [])).toBe(false);
  });
});

describe("menuToCatalog", () => {
  it.each([
    ["burger", demoMenu],
    ["bubble tea", teaMenu],
  ] as const)("round-trips the %s demo menu through Square's catalog shape", (_name, demo) => {
    const objects = menuToCatalog(demo, "AUD");
    expect(objects.every((o) => o.id.startsWith("#"))).toBe(true);
    const { menu, skipped } = catalogToMenu(objects, location);
    expect(skipped).toEqual([]);
    expect(validateMenu(menu)).toEqual([]);
    expect(menu.items.map((i) => [i.name, i.price])).toEqual(demo.items.map((i) => [i.name, i.price]));
    for (const item of demo.items) {
      const back = menu.items.find((i) => i.name === item.name)!;
      const limits = (groups: string[], m: typeof menu) =>
        groups.map((id) => m.modifierGroups.find((g) => g.id === id)!).map((g) => [g.name, g.min, g.max, g.options.length]);
      expect(limits(back.modifierGroupIds, menu)).toEqual(limits(item.modifierGroupIds, demo));
    }
  });
});

describe("slug", () => {
  it("makes readable ids", () => {
    expect(slug("Fish & Chips")).toBe("fish-and-chips");
    expect(slug("Crème Brûlée!")).toBe("creme-brulee");
  });
});
