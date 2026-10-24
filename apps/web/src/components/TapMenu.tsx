"use client";

import { useState } from "react";
import { checkAvailable, formatPrice, getGroup, type Menu, type MenuItem } from "@foa/core";
import type { Size } from "./ui";

interface Props {
  menu: Menu;
  size?: Size;
  disabled?: boolean;
  onPick: (item: MenuItem) => void;
}

/** Price with default options applied, so "Fries" shows what a medium actually costs. */
function startingPrice(menu: Menu, item: MenuItem) {
  return item.modifierGroupIds.reduce((sum, id) => {
    const group = getGroup(menu, id);
    return sum + (group?.options.filter((o) => o.default).reduce((s, o) => s + o.priceDelta, 0) ?? 0);
  }, item.price);
}

export function TapMenu({ menu, size = "regular", disabled, onPick }: Props) {
  const categories = menu.categories.filter((c) => menu.items.some((i) => i.categoryId === c.id));
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const kiosk = size === "kiosk";
  const now = new Date();
  const items = menu.items.filter((i) => i.categoryId === active);

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = categories[(index + step + categories.length) % categories.length];
    if (!next) return;
    setActive(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Menu categories"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:thin]"
      >
        {categories.map((category, index) => {
          const selected = category.id === active;
          return (
            <button
              key={category.id}
              id={`tab-${category.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="menu-items"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(category.id)}
              onKeyDown={(e) => onTabKey(e, index)}
              className={`shrink-0 rounded-full border-2 font-bold transition-colors ${kiosk ? "min-h-14 px-6 text-lg" : "min-h-11 px-4"} ${
                selected ? "border-char bg-char text-white" : "border-line bg-card text-char hover:border-char/40"
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>

      <div
        id="menu-items"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className={`mt-3 grid gap-3 ${kiosk ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        {items.map((item) => {
          const blocked = checkAvailable(menu, item, now);
          const reason =
            blocked?.code === "out_of_stock"
              ? "Sold out"
              : blocked?.code === "unavailable_now"
                ? `From ${blocked.availability.start}`
                : null;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled || !!blocked}
              onClick={() => onPick(item)}
              className={`group flex flex-col items-start rounded-2xl border-2 border-line bg-card text-left transition-colors hover:border-pickle disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line ${
                kiosk ? "min-h-36 p-5" : "min-h-24 p-4"
              }`}
            >
              <span className={`font-display font-bold leading-tight ${kiosk ? "text-2xl" : "text-lg"}`}>{item.name}</span>
              {item.description && (
                <span className={`mt-1 line-clamp-2 text-char-soft ${kiosk ? "" : "text-sm"}`}>{item.description}</span>
              )}
              <span className="mt-auto flex w-full items-end justify-between gap-2 pt-3">
                <span className={`font-bold tabular-nums ${kiosk ? "text-xl" : ""}`}>{formatPrice(startingPrice(menu, item), menu.currency)}</span>
                {reason ? (
                  <span className="rounded-full bg-paper px-2 py-0.5 text-sm font-bold text-char-soft">{reason}</span>
                ) : item.tags.includes("vegan") || item.tags.includes("vegetarian") ? (
                  <span className="rounded-full bg-lettuce px-2 py-0.5 text-sm font-bold text-pickle">
                    {item.tags.includes("vegan") ? "Vegan" : "Vegetarian"}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
