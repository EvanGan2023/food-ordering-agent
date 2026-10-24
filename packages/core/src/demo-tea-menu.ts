import { Menu, type MenuInput } from "./schema";

/*
 * Bramble Tea is a fictional bubble tea shop used for demos and tests.
 * Drinks ask for size, sugar and ice, and offer toppings, like most tea shops.
 * Prices (AUD cents) and allergens are made up and are not real nutrition data.
 */

type Option = MenuInput["modifierGroups"][number]["options"][number];
const option = (id: string, name: string, priceDelta = 0, aliases: string[] = [], isDefault = false): Option => ({
  id,
  name,
  aliases,
  priceDelta,
  default: isDefault,
});

const modifierGroups: MenuInput["modifierGroups"] = [
  {
    // No defaults for size, sugar or ice: the shop always asks.
    id: "tea-size",
    name: "Size",
    min: 1,
    max: 1,
    options: [option("medium", "Medium", 0, ["regular size"]), option("large", "Large", 100)],
  },
  {
    id: "sugar",
    name: "Sugar",
    min: 1,
    max: 1,
    options: [
      option("0", "0% sugar", 0, ["no sugar", "zero sugar", "sugar free", "unsweetened"]),
      option("25", "25% sugar", 0, ["quarter sugar", "little sugar", "light sugar"]),
      option("50", "50% sugar", 0, ["half sugar", "half sweet", "half"]),
      option("75", "75% sugar", 0, ["less sugar", "less sweet", "three quarter sugar"]),
      option("100", "100% sugar", 0, ["full sugar", "normal sugar", "regular sugar", "full sweet"]),
    ],
  },
  {
    id: "ice",
    name: "Ice",
    min: 1,
    max: 1,
    options: [
      option("none", "No ice", 0, ["ice free"]),
      option("less", "Less ice", 0, ["light ice", "little ice"]),
      option("regular", "Regular ice", 0, ["normal ice", "full ice"]),
    ],
  },
  {
    id: "tea-milk",
    name: "Milk",
    min: 1,
    max: 1,
    options: [
      option("regular", "Regular milk", 0, ["dairy", "normal milk"], true),
      option("oat", "Oat milk", 70),
      option("lactose-free", "Lactose-free milk", 50, ["lactose free"]),
    ],
  },
  {
    id: "toppings",
    name: "Toppings",
    min: 0,
    max: 3,
    offer: true,
    options: [
      option("pearls", "Tapioca pearls", 80, ["pearls", "pearl", "boba", "tapioca", "bubbles"]),
      option("coconut-jelly", "Coconut jelly", 80, ["coconut"]),
      option("pudding", "Egg pudding", 80, ["pudding"]),
      option("grass-jelly", "Grass jelly", 80),
      option("popping", "Popping strawberry pearls", 100, ["popping pearls", "popping boba", "strawberry pearls"]),
      option("cheese-foam", "Cheese foam", 120, ["cheese cream", "cream top", "foam"]),
    ],
  },
  {
    id: "seasoning",
    name: "Seasoning",
    min: 1,
    max: 1,
    options: [option("salt-pepper", "Salt & pepper"), option("plum", "Plum powder", 0, ["plum"]), option("spicy", "Spicy", 0, ["chilli", "hot"])],
  },
];

type Item = MenuInput["items"][number];

const MILK_TEA = ["tea-size", "sugar", "ice", "tea-milk", "toppings"];
const FRUIT_TEA = ["tea-size", "sugar", "ice", "toppings"];
const SLUSH = ["tea-size", "sugar", "toppings"];

const items: Item[] = [
  // Milk tea
  {
    id: "classic-milk-tea",
    name: "Classic Milk Tea",
    aliases: ["milk tea", "black milk tea", "original milk tea", "bubble tea", "pearl milk tea"],
    categoryId: "milk-tea",
    price: 650,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },
  {
    id: "brown-sugar-milk-tea",
    name: "Brown Sugar Milk Tea",
    aliases: ["brown sugar tea", "brown sugar boba"],
    categoryId: "milk-tea",
    price: 750,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },
  {
    id: "taro-milk-tea",
    name: "Taro Milk Tea",
    aliases: ["taro"],
    categoryId: "milk-tea",
    price: 700,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },
  {
    id: "jasmine-milk-tea",
    name: "Jasmine Green Milk Tea",
    aliases: ["jasmine milk tea", "green milk tea"],
    categoryId: "milk-tea",
    price: 650,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },
  {
    id: "thai-milk-tea",
    name: "Thai Milk Tea",
    aliases: ["thai tea"],
    categoryId: "milk-tea",
    price: 700,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },
  {
    id: "matcha-latte",
    name: "Matcha Latte",
    aliases: ["matcha", "matcha milk tea"],
    categoryId: "milk-tea",
    price: 750,
    allergens: ["milk"],
    modifierGroupIds: MILK_TEA,
  },

  // Fruit tea
  {
    id: "passionfruit-green-tea",
    name: "Passionfruit Green Tea",
    aliases: ["passionfruit tea", "passion fruit tea", "passionfruit"],
    categoryId: "fruit-tea",
    price: 680,
    tags: ["vegan"],
    modifierGroupIds: FRUIT_TEA,
  },
  {
    id: "mango-green-tea",
    name: "Mango Green Tea",
    aliases: ["mango tea"],
    categoryId: "fruit-tea",
    price: 680,
    tags: ["vegan"],
    modifierGroupIds: FRUIT_TEA,
  },
  {
    id: "lychee-black-tea",
    name: "Lychee Black Tea",
    aliases: ["lychee tea"],
    categoryId: "fruit-tea",
    price: 680,
    tags: ["vegan"],
    modifierGroupIds: FRUIT_TEA,
  },
  {
    id: "peach-oolong",
    name: "Peach Oolong",
    aliases: ["peach tea", "peach oolong tea"],
    categoryId: "fruit-tea",
    price: 700,
    tags: ["vegan"],
    modifierGroupIds: FRUIT_TEA,
  },

  // Slush
  {
    id: "mango-slush",
    name: "Mango Slush",
    aliases: ["mango smoothie"],
    categoryId: "slush",
    price: 750,
    tags: ["vegan"],
    modifierGroupIds: SLUSH,
  },
  {
    id: "strawberry-slush",
    name: "Strawberry Slush",
    aliases: ["strawberry smoothie"],
    categoryId: "slush",
    price: 750,
    tags: ["vegan"],
    modifierGroupIds: SLUSH,
  },

  // Snacks
  {
    id: "popcorn-chicken",
    name: "Popcorn Chicken",
    aliases: ["chicken bites", "popcorn"],
    categoryId: "snacks",
    price: 850,
    allergens: ["gluten", "soy"],
    modifierGroupIds: ["seasoning"],
  },
  {
    id: "sweet-potato-fries",
    name: "Sweet Potato Fries",
    aliases: ["sweet potato chips", "sweet potato"],
    categoryId: "snacks",
    price: 650,
    tags: ["vegetarian"],
    modifierGroupIds: ["seasoning"],
  },
];

export const teaMenuInput: MenuInput = {
  id: "bramble-tea",
  name: "Bramble Tea (demo)",
  currency: "AUD",
  timezone: "Australia/Sydney",
  categories: [
    { id: "milk-tea", name: "Milk Tea" },
    { id: "fruit-tea", name: "Fruit Tea" },
    { id: "slush", name: "Slush" },
    { id: "snacks", name: "Snacks" },
  ],
  modifierGroups,
  items,
};

export const teaMenu: Menu = Menu.parse(teaMenuInput);
