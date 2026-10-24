import { describe, expect, it } from "vitest";
import { Menu, demoMenu, demoMenuInput, getItem, teaMenu, validateMenu } from "../src";

describe("demo menu", () => {
  it("parses against the menu schema", () => {
    expect(() => Menu.parse(demoMenuInput)).not.toThrow();
  });

  it("has no broken references", () => {
    expect(validateMenu(demoMenu)).toEqual([]);
  });

  it("has a meal for each combo-able main", () => {
    const meals = demoMenu.items.filter((item) => item.categoryId === "meals");
    expect(meals).toHaveLength(10);
    for (const meal of meals) {
      expect(meal.modifierGroupIds).toEqual(expect.arrayContaining(["meal-size", "meal-side", "meal-drink"]));
    }
  });

  it("links each main to its meal, so the agent can offer it", () => {
    expect(getItem(demoMenu, "cheeseburger")?.mealItemId).toBe("cheeseburger-meal");
    expect(getItem(demoMenu, "fries")?.mealItemId).toBeUndefined();
  });

  it("limits breakfast items to breakfast hours", () => {
    const breakfast = demoMenu.items.filter((item) => item.categoryId === "breakfast");
    expect(breakfast.length).toBeGreaterThan(0);
    for (const item of breakfast) expect(item.availability).toEqual({ start: "05:00", end: "10:30" });
  });

  it("catches an option alias that names two options, and an unknown meal", () => {
    const broken = Menu.parse({
      ...demoMenuInput,
      modifierGroups: [
        { id: "g", name: "G", min: 0, max: 1, offer: true, options: [{ id: "a", name: "A", aliases: ["both"] }, { id: "b", name: "B", aliases: ["both"] }] },
      ],
      categories: [{ id: "c", name: "C" }],
      items: [{ id: "x", name: "X", categoryId: "c", price: 100, modifierGroupIds: ["g"], mealItemId: "x-meal" }],
    });
    expect(validateMenu(broken)).toEqual(['group "g": "both" names both "a" and "b"', 'item "x": unknown meal item "x-meal"']);
  });

  it("catches broken references in a bad menu", () => {
    const broken = Menu.parse({
      ...demoMenuInput,
      items: [{ id: "x", name: "X", categoryId: "nope", price: 100, modifierGroupIds: ["missing"] }],
    });
    expect(validateMenu(broken)).toEqual(
      expect.arrayContaining([
        'item "x": unknown category "nope"',
        'item "x": unknown modifier group "missing"',
      ]),
    );
  });
});

describe("bubble tea demo menu", () => {
  it("has no broken references", () => {
    expect(validateMenu(teaMenu)).toEqual([]);
  });

  it("asks size, sugar and ice on every drink and offers toppings", () => {
    const drinks = teaMenu.items.filter((item) => item.categoryId !== "snacks");
    for (const drink of drinks) expect(drink.modifierGroupIds).toEqual(expect.arrayContaining(["tea-size", "sugar", "toppings"]));
    const required = teaMenu.modifierGroups.filter((g) => ["tea-size", "sugar", "ice"].includes(g.id));
    for (const group of required) {
      expect(group.min).toBe(1);
      expect(group.options.some((o) => o.default)).toBe(false);
    }
    expect(teaMenu.modifierGroups.find((g) => g.id === "toppings")).toMatchObject({ min: 0, offer: true });
  });
});
