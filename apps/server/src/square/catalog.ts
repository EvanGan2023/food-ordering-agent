import { validateMenu, type Menu, type MenuInput, type ModifierGroup } from "@foa/core";
import type { SquareClient } from "./client";

/**
 * Square's catalog as our menu, and our menu as a Square catalog.
 * - An item with one variation is one menu item; with several (Small, Large) they become a
 *   pick-one "Size" group whose options are the variations (`posVariations`).
 * - Modifier lists become modifier groups; a list's min/max can be overridden per item.
 * - Ids are readable slugs for the agent; Square's ids are kept in `posId`.
 * - Taxes stay in Square, which applies them to orders; the menu only notes whether any are added on top of prices.
 */

interface Money {
  amount?: number;
  currency?: string;
}

interface LocationOverride {
  location_id?: string;
  sold_out?: boolean;
}

export interface CatalogObject {
  type: string;
  id: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  category_data?: { name?: string };
  item_data?: {
    name?: string;
    description?: string;
    description_plaintext?: string;
    is_archived?: boolean;
    categories?: { id: string }[];
    category_id?: string;
    reporting_category?: { id: string };
    tax_ids?: string[];
    variations?: CatalogObject[];
    modifier_list_info?: {
      modifier_list_id: string;
      min_selected_modifiers?: number;
      max_selected_modifiers?: number;
      enabled?: boolean;
    }[];
  };
  item_variation_data?: {
    item_id?: string;
    name?: string;
    pricing_type?: string;
    price_money?: Money;
    location_overrides?: LocationOverride[];
  };
  modifier_list_data?: {
    name?: string;
    selection_type?: "SINGLE" | "MULTIPLE";
    min_selected_modifiers?: number;
    max_selected_modifiers?: number;
    modifiers?: CatalogObject[];
  };
  modifier_data?: {
    name?: string;
    price_money?: Money;
    on_by_default?: boolean;
    location_overrides?: LocationOverride[];
  };
  tax_data?: {
    name?: string;
    /** ADDITIVE: added on top of the price (e.g. US sales tax). INCLUSIVE: part of the price (e.g. GST). */
    inclusion_type?: "ADDITIVE" | "INCLUSIVE";
    enabled?: boolean;
  };
}

export interface SquareLocation {
  id: string;
  name?: string;
  business_name?: string;
  timezone?: string;
  currency?: string;
}

const SIZE_WORDS = /^(x?-?small|medium|regular|large|x?-?large|extra large|kids?|mini|s|m|l|xl|single|double|\d+\s*(oz|ml|pc|pcs|piece|pieces))$/i;

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}

/** Hands out unique slugs: "cola", then "cola-2". */
function slugger() {
  const used = new Set<string>();
  return (text: string) => {
    const base = slug(text);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

const atLocation = (object: CatalogObject, locationId: string) =>
  !object.is_deleted &&
  (object.present_at_all_locations ?? true
    ? !object.absent_at_location_ids?.includes(locationId)
    : !!object.present_at_location_ids?.includes(locationId));

const soldOut = (overrides: LocationOverride[] | undefined, locationId: string) =>
  !!overrides?.some((o) => o.location_id === locationId && o.sold_out);

/** A positive number from Square, where -1 or missing means "not set". */
const setNumber = (n: number | undefined) => (n !== undefined && n >= 0 ? n : undefined);

/**
 * Builds a menu from a Square catalog for one location. Items with no fixed-price variation
 * there are skipped (the agent can't price them); `skipped` says which and why.
 */
export function catalogToMenu(
  objects: CatalogObject[],
  location: SquareLocation,
): { menu: Menu; skipped: string[] } {
  const skipped: string[] = [];
  const here = objects.filter((o) => atLocation(o, location.id));
  const byId = new Map(here.map((o) => [o.id, o]));
  const currency = here.flatMap((o) => o.item_data?.variations ?? []).find((v) => v.item_variation_data?.price_money?.currency)
    ?.item_variation_data?.price_money?.currency;

  const categoryId = slugger();
  const categories = new Map<string, { id: string; name: string }>();
  const categoryFor = (squareId: string | undefined) => {
    const name = (squareId && byId.get(squareId)?.category_data?.name) || "Other";
    const key = squareId && byId.has(squareId) ? squareId : "other";
    if (!categories.has(key)) categories.set(key, { id: categoryId(name), name });
    return categories.get(key)!.id;
  };

  const groupId = slugger();
  const groups = new Map<string, ModifierGroup>();
  /** One group per modifier list and min/max, since items can override a list's limits. */
  const listGroup = (listId: string, minOverride?: number, maxOverride?: number): string | null => {
    const list = byId.get(listId);
    const data = list?.modifier_list_data;
    if (!list || !data) return null;
    const optionId = slugger();
    const options = (data.modifiers ?? [])
      .filter((m) => atLocation(m, location.id) && m.modifier_data?.name && !soldOut(m.modifier_data.location_overrides, location.id))
      .map((m) => ({
        id: optionId(m.modifier_data!.name!),
        name: m.modifier_data!.name!,
        aliases: [],
        priceDelta: m.modifier_data!.price_money?.amount ?? 0,
        default: !!m.modifier_data!.on_by_default,
        posId: m.id,
      }));
    if (!options.length) return null;
    const single = data.selection_type !== "MULTIPLE";
    const max = Math.min(setNumber(maxOverride) || setNumber(data.max_selected_modifiers) || (single ? 1 : options.length), options.length);
    const min = Math.min(setNumber(minOverride) ?? setNumber(data.min_selected_modifiers) ?? 0, max);
    const key = `${listId}:${min}:${max}`;
    if (!groups.has(key)) {
      const name = data.name || "Options";
      groups.set(key, { id: groupId(name), name, min, max, offer: false, posVariations: false, options });
    }
    return groups.get(key)!.id;
  };

  const itemId = slugger();
  const items: MenuInput["items"] = [];
  const itemTaxIds = new Set<string>();
  for (const object of here) {
    const data = object.item_data;
    if (object.type !== "ITEM" || !data?.name || data.is_archived) continue;
    const variations = (data.variations ?? []).filter(
      (v) =>
        atLocation(v, location.id) &&
        v.item_variation_data?.pricing_type !== "VARIABLE_PRICING" &&
        typeof v.item_variation_data?.price_money?.amount === "number",
    );
    if (!variations.length) {
      skipped.push(`${data.name}: no fixed price at this location`);
      continue;
    }
    for (const taxId of data.tax_ids ?? []) itemTaxIds.add(taxId);
    const available = variations.filter((v) => !soldOut(v.item_variation_data?.location_overrides, location.id));
    const priced = (available.length ? available : variations).map((v) => ({
      id: v.id,
      name: v.item_variation_data?.name || data.name!,
      price: v.item_variation_data!.price_money!.amount!,
    }));
    const base = Math.min(...priced.map((v) => v.price));
    const id = itemId(data.name);
    const modifierGroupIds: string[] = [];

    if (priced.length > 1) {
      const optionId = slugger();
      const sizes = priced.every((v) => SIZE_WORDS.test(v.name.trim()));
      const variationGroup: ModifierGroup = {
        id: groupId(`${data.name} ${sizes ? "size" : "type"}`),
        name: sizes ? "Size" : "Type",
        min: 1,
        max: 1,
        offer: false,
        posVariations: true,
        options: priced.map((v) => ({
          id: optionId(v.name),
          name: v.name,
          aliases: [],
          priceDelta: v.price - base,
          default: false,
          posId: v.id,
        })),
      };
      groups.set(`variations:${object.id}`, variationGroup);
      modifierGroupIds.push(variationGroup.id);
    }
    for (const info of data.modifier_list_info ?? []) {
      if (info.enabled === false) continue;
      const group = listGroup(info.modifier_list_id, info.min_selected_modifiers, info.max_selected_modifiers);
      if (group && !modifierGroupIds.includes(group)) modifierGroupIds.push(group);
    }

    items.push({
      id,
      name: data.name,
      description: data.description_plaintext ?? data.description ?? "",
      categoryId: categoryFor(data.categories?.[0]?.id ?? data.category_id ?? data.reporting_category?.id),
      price: base,
      modifierGroupIds,
      inStock: available.length > 0,
      posId: priced.length === 1 ? priced[0]!.id : undefined,
    });
  }

  const menu = {
    id: slug(location.business_name || location.name || "square"),
    name: location.business_name || location.name || "Square menu",
    currency: location.currency || currency || "AUD",
    timezone: location.timezone || "Australia/Sydney",
    taxAddedAtCheckout: here.some(
      (o) => o.tax_data?.inclusion_type === "ADDITIVE" && o.tax_data.enabled !== false && itemTaxIds.has(o.id),
    ),
    categories: [...categories.values()],
    modifierGroups: [...groups.values()],
    items,
  } satisfies MenuInput;
  return { menu: menu as Menu, skipped };
}

/** Every catalog object of the menu's types, following Square's pages. */
export async function fetchCatalog(client: SquareClient): Promise<CatalogObject[]> {
  const objects: CatalogObject[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ types: "ITEM,MODIFIER_LIST,CATEGORY,TAX" });
    if (cursor) query.set("cursor", cursor);
    const page = await client.request<{ objects?: CatalogObject[]; cursor?: string }>("GET", `/v2/catalog/list?${query}`);
    objects.push(...(page.objects ?? []));
    cursor = page.cursor;
  } while (cursor);
  return objects;
}

export async function fetchLocation(client: SquareClient): Promise<SquareLocation> {
  const { location } = await client.request<{ location: SquareLocation }>("GET", `/v2/locations/${client.config.locationId}`);
  return location;
}

/** The restaurant's menu, straight from Square. Throws if it can't be used as a menu. */
export async function loadSquareMenu(client: SquareClient): Promise<{ menu: Menu; skipped: string[] }> {
  const [objects, location] = await Promise.all([fetchCatalog(client), fetchLocation(client)]);
  const result = catalogToMenu(objects, location);
  const problems = validateMenu(result.menu);
  if (problems.length) throw new Error(`The Square catalog can't be used as a menu:\n- ${problems.join("\n- ")}`);
  if (!result.menu.items.length) throw new Error("The Square catalog has no items with a fixed price at this location.");
  return result;
}

/**
 * Our menu as new Square catalog objects (temporary "#" ids), for filling an empty Sandbox
 * with a demo menu. Every item gets one "Regular" variation and its groups as modifier lists.
 */
export function menuToCatalog(menu: Menu, currency: string): CatalogObject[] {
  const money = (amount: number) => ({ amount, currency });
  const categories: CatalogObject[] = menu.categories.map((c) => ({
    type: "CATEGORY",
    id: `#cat-${c.id}`,
    present_at_all_locations: true,
    category_data: { name: c.name },
  }));
  const lists: CatalogObject[] = menu.modifierGroups.map((g) => ({
    type: "MODIFIER_LIST",
    id: `#ml-${g.id}`,
    present_at_all_locations: true,
    modifier_list_data: {
      name: g.name,
      selection_type: g.max === 1 ? "SINGLE" : "MULTIPLE",
      modifiers: g.options.map((o) => ({
        type: "MODIFIER",
        id: `#m-${g.id}-${o.id}`,
        present_at_all_locations: true,
        modifier_data: { name: o.name, price_money: money(o.priceDelta), on_by_default: o.default },
      })),
    },
  }));
  const groups = new Map(menu.modifierGroups.map((g) => [g.id, g]));
  const items: CatalogObject[] = menu.items.map((item) => ({
    type: "ITEM",
    id: `#item-${item.id}`,
    present_at_all_locations: true,
    item_data: {
      name: item.name,
      description: item.description || undefined,
      categories: [{ id: `#cat-${item.categoryId}` }],
      variations: [
        {
          type: "ITEM_VARIATION",
          id: `#var-${item.id}`,
          present_at_all_locations: true,
          item_variation_data: {
            item_id: `#item-${item.id}`,
            name: "Regular",
            pricing_type: "FIXED_PRICING",
            price_money: money(item.price),
          },
        },
      ],
      modifier_list_info: item.modifierGroupIds.map((groupId) => ({
        modifier_list_id: `#ml-${groupId}`,
        min_selected_modifiers: groups.get(groupId)?.min ?? 0,
        max_selected_modifiers: groups.get(groupId)?.max ?? 1,
        enabled: true,
      })),
    },
  }));
  return [...categories, ...lists, ...items];
}
