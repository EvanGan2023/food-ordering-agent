import { describe, expect, it } from "vitest";
import {
  demoMenu,
  getGroup,
  getItem,
  isExactItem,
  menuFit,
  namesOption,
  rankItems,
  saysPhrase,
  similarity,
  soundsLike,
  teaMenu,
  unnamedOptions,
  type AddItemInput,
} from "../src";
import evals from "../../../evals/demo-orders.json";
import teaEvals from "../../../evals/tea-orders.json";

const item = (id: string) => getItem(demoMenu, id)!;

describe("saysPhrase", () => {
  it("ignores case, punctuation and plurals", () => {
    expect(saysPhrase("Two CHEESEBURGERS, please!", "Cheeseburger")).toBe(true);
    expect(saysPhrase("two large fries", "Fries")).toBe(true);
  });

  it("needs the whole phrase, word for word", () => {
    expect(saysPhrase("a cheese burgr", "Cheeseburger")).toBe(false);
    expect(saysPhrase("a double", "Double Cheeseburger")).toBe(false);
  });
});

describe("isExactItem", () => {
  it("accepts the menu name or an alias the owner added", () => {
    expect(isExactItem(demoMenu, "two cheeseburgers no pickles", item("cheeseburger"))).toBe(true);
    expect(isExactItem(demoMenu, "large chips", item("fries"))).toBe(true);
  });

  it("rejects misspellings", () => {
    expect(isExactItem(demoMenu, "a cheese burgr", item("cheeseburger"))).toBe(false);
    expect(isExactItem(demoMenu, "flat wite", item("flat-white"))).toBe(false);
  });

  it("doubts a short alias when a longer name nearly matches the same words", () => {
    // "burger" is an alias of Classic Burger, but this is nearly "Spicy Chicken Burger".
    expect(isExactItem(demoMenu, "spicy chikken burger", item("classic-burger"))).toBe(false);
    // "cheese burger" is an alias of Cheeseburger, but "dubble" sounds like "double".
    expect(isExactItem(demoMenu, "dubble cheese burger", item("cheeseburger"))).toBe(false);
    // Saying "meal" means the meal, not the burger.
    expect(isExactItem(demoMenu, "a cheeseburger meal", item("cheeseburger"))).toBe(false);
  });

  it("doesn't doubt an item because of other items elsewhere in the sentence", () => {
    expect(isExactItem(demoMenu, "Two cheeseburgers, no pickles, a large fries and a medium cola zero", item("cheeseburger"))).toBe(true);
    expect(isExactItem(demoMenu, "Crispy chicken burger, no mayo, add cheese", item("crispy-chicken-burger"))).toBe(true);
  });
});

describe("rankItems", () => {
  it("suggests the closest full name for a misheard item", () => {
    expect(rankItems(demoMenu, "spicy chikken burger")[0]?.item.id).toBe("spicy-chicken-burger");
    expect(rankItems(demoMenu, "a cheese burgr")[0]?.item.id).toBe("cheeseburger");
    expect(rankItems(demoMenu, "flat wite")[0]).toMatchObject({ exact: false, item: { id: "flat-white" } });
  });

  it("puts exact names first", () => {
    expect(rankItems(demoMenu, "big cheese deluxe")[0]).toMatchObject({ exact: true, item: { id: "big-cheese-deluxe" } });
  });
});

describe("options", () => {
  it("accepts the key words of an option name", () => {
    const large = demoMenu.modifierGroups.find((g) => g.id === "meal-size")!.options.find((o) => o.id === "large")!;
    expect(namesOption("make it large", large)).toBe(true);
    const noPickles = demoMenu.modifierGroups.find((g) => g.id === "hold-classic")!.options.find((o) => o.id === "no-pickles")!;
    expect(namesOption("without pickles", noPickles)).toBe(true);
  });

  it("flags options the customer didn't say, but not defaults", () => {
    const guesses = unnamedOptions(demoMenu, "cheeseburger meal with a coke", { "meal-drink": ["cola-zero"], "meal-side": ["fries"] });
    expect(guesses.map((g) => g.option.id)).toEqual(["cola-zero"]);
  });
});

describe("option aliases and word order", () => {
  const group = (id: string) => getGroup(teaMenu, id)!;
  const option = (groupId: string, id: string) => group(groupId).options.find((o) => o.id === id)!;

  it("counts an alias as naming the option", () => {
    expect(namesOption("half sugar please", option("sugar", "50"), group("sugar"))).toBe(true);
    expect(namesOption("with boba", option("toppings", "pearls"), group("toppings"))).toBe(true);
    expect(namesOption("without sugar", option("sugar", "0"), group("sugar"))).toBe(true);
  });

  it("doesn't join words from different choices", () => {
    expect(namesOption("no sugar, regular ice", option("ice", "none"), group("ice"))).toBe(false);
    expect(namesOption("no sugar, regular ice", option("ice", "regular"), group("ice"))).toBe(true);
  });

  it("still reads a list of leave-offs", () => {
    const hold = getGroup(demoMenu, "hold-classic")!;
    const noOnions = hold.options.find((o) => o.id === "no-onion")!;
    expect(namesOption("no pickles or onions", noOnions, hold)).toBe(true);
  });

  it("names a tea and its choices exactly", () => {
    const taro = getItem(teaMenu, "taro-milk-tea")!;
    const classic = getItem(teaMenu, "classic-milk-tea")!;
    expect(isExactItem(teaMenu, "a taro milk tea", taro)).toBe(true);
    expect(isExactItem(teaMenu, "a taro milk tea", classic)).toBe(false);
    expect(isExactItem(teaMenu, "a large milk tea", classic)).toBe(true);
  });
});

describe("misheard speech", () => {
  it("suggests the item a misheard phrase sounds like", () => {
    expect(rankItems(teaMenu, "can I get a terror milk tea")[0]?.item.id).toBe("taro-milk-tea");
    expect(rankItems(teaMenu, "a tie milk tea")[0]?.item.id).toBe("thai-milk-tea");
    expect(rankItems(teaMenu, "peach oh long large")[0]?.item.id).toBe("peach-oolong");
    expect(rankItems(demoMenu, "a cheese burglar")[0]?.item.id).toBe("cheeseburger");
    expect(rankItems(demoMenu, "flat what with oat milk")[0]?.item.id).toBe("flat-white");
  });

  it("doesn't take a sound-alike for the exact words of a shorter name", () => {
    // "milk tea" is an alias of Classic Milk Tea, but "terror milk tea" sounds like Taro Milk Tea.
    expect(isExactItem(teaMenu, "a terror milk tea", getItem(teaMenu, "classic-milk-tea")!)).toBe(false);
    expect(isExactItem(teaMenu, "a large milk tea", getItem(teaMenu, "classic-milk-tea")!)).toBe(true);
  });

  it("points out misheard menu words, and only those", () => {
    expect(soundsLike(teaMenu, "a large tie milk tea have sugar")).toMatchObject([
      { heard: "tie milk tea", means: "Thai Milk Tea" },
      { heard: "have sugar", means: "50% sugar (sugar)" },
    ]);
    expect(soundsLike(teaMenu, "two jasmine milk teas please")).toEqual([]);
    expect(soundsLike(demoMenu, "two cheeseburgers no pickles and a large fries")).toEqual([]);
  });

  it("prefers the transcript with more menu words", () => {
    expect(menuFit(teaMenu, "a taro milk tea")).toBeGreaterThan(menuFit(teaMenu, "a terror milk tea"));
  });
});

describe("similarity", () => {
  it("scores spelling distance from 0 to 1", () => {
    expect(similarity("cheeseburger", "Cheeseburger")).toBe(1);
    expect(similarity("cheese burgr", "cheeseburger")).toBeGreaterThan(0.9);
    expect(similarity("water", "cheeseburger")).toBeLessThan(0.3);
  });
});

describe("sample orders", () => {
  it.each(evals.orders.map((o) => [o.id, o] as const))("%s names every item and choice exactly", (_id, order) => {
    for (const line of order.lines as AddItemInput[]) {
      expect(isExactItem(demoMenu, order.utterance, item(line.itemId))).toBe(true);
      expect(unnamedOptions(demoMenu, order.utterance, line.modifiers ?? {})).toEqual([]);
    }
  });

  it.each(evals.confirmations.map((c) => [c.id, c] as const))("%s has something to confirm", (_id, c) => {
    const first = c.turns[0]!;
    const doubtful = (c.lines as AddItemInput[]).some(
      (line) => !isExactItem(demoMenu, first, item(line.itemId)) || unnamedOptions(demoMenu, first, line.modifiers ?? {}).length > 0,
    );
    expect(doubtful).toBe(true);
  });
});

describe("bubble tea sample orders", () => {
  it.each(teaEvals.orders.map((o) => [o.id, o] as const))("%s names every item and choice exactly", (_id, order) => {
    for (const line of order.lines as AddItemInput[]) {
      expect(isExactItem(teaMenu, order.utterance, getItem(teaMenu, line.itemId)!)).toBe(true);
      expect(unnamedOptions(teaMenu, order.utterance, line.modifiers ?? {})).toEqual([]);
    }
  });
});

describe("bubble tea misheard orders", () => {
  it.each(teaEvals.confirmations.map((c) => [c.id, c] as const))("%s has something to confirm and a valid cart", (_id, c) => {
    const first = c.turns[0]!;
    const doubtful = (c.lines as AddItemInput[]).some(
      (line) => !isExactItem(teaMenu, first, getItem(teaMenu, line.itemId)!) || unnamedOptions(teaMenu, first, line.modifiers ?? {}).length > 0,
    );
    expect(doubtful).toBe(true);
  });
});
