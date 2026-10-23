import { describe, expect, it } from "vitest";
import { Menu, demoMenu, demoMenuInput, validateMenu } from "../src";

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

  it("limits breakfast items to breakfast hours", () => {
    const breakfast = demoMenu.items.filter((item) => item.categoryId === "breakfast");
    expect(breakfast.length).toBeGreaterThan(0);
    for (const item of breakfast) expect(item.availability).toEqual({ start: "05:00", end: "10:30" });
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
