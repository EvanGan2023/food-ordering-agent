import { describe, expect, it } from "vitest";
import { demoMenu, findItems } from "../src";

const top = (query: string) => findItems(demoMenu, query)[0]?.item.id;

describe("findItems", () => {
  it.each([
    ["cheeseburger", "cheeseburger"],
    ["chips", "fries"],
    ["nuggets", "chicken-bites-6"],
    ["10 nuggets please", "chicken-bites-10"],
    ["pancakes", "hotcakes"],
    ["spicy", "spicy-chicken-burger"],
    ["apple pie", "apple-turnover"],
    ["diet cola", "cola-zero"],
    ["double stack meal", "double-stack-meal"],
    ["kids meal", "kids-pack"],
  ])("finds %s", (query, expected) => {
    expect(top(query)).toBe(expected);
  });

  it("matches tags", () => {
    const ids = findItems(demoMenu, "vegetarian", 20).map((hit) => hit.item.id);
    expect(ids).toContain("garden-veggie-burger");
    expect(ids).not.toContain("cheeseburger");
  });

  it("returns nothing for empty or unrelated queries", () => {
    expect(findItems(demoMenu, "   ")).toEqual([]);
    expect(findItems(demoMenu, "sushi")).toEqual([]);
  });
});
