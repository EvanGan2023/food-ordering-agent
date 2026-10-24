import { describe, expect, it } from "vitest";
import { soundKey, soundSimilarity } from "../src";

describe("soundKey", () => {
  it.each([
    ["terror", "taro"],
    ["tie", "thai"],
    ["ships", "chips"],
    ["less eyes", "less ice"],
    ["peach oh long", "peach oolong"],
    ["lee chee", "lychee"],
    ["flat what", "flat white"],
    ["cheese burger", "cheeseburger"],
    ["perls", "pearls"],
  ])("hears %s like %s", (heard, menu) => {
    expect(soundKey(heard)).toBe(soundKey(menu));
  });

  it("keeps different-sounding words apart", () => {
    expect(soundKey("water")).not.toBe(soundKey("matcha"));
    expect(soundKey("large")).not.toBe(soundKey("lunch"));
    expect(soundSimilarity("milk", "mango")).toBeLessThan(0.7);
  });

  it("trusts very short codes less", () => {
    expect(soundSimilarity("terror", "taro")).toBeLessThan(1);
    expect(soundSimilarity("terror milk tea", "taro milk tea")).toBe(1);
  });
});
