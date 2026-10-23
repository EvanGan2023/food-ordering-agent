"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatPrice, getGroup, type Menu, type MenuItem, type ModifierGroup, type Selections } from "@foa/core";
import { buttonClass, type Size } from "./ui";

interface Props {
  menu: Menu;
  item: MenuItem;
  /** Current choices when editing a cart line; defaults are used when adding. */
  initial?: Selections;
  mode: "add" | "edit";
  size?: Size;
  busy?: boolean;
  onSubmit: (modifiers: Selections, qty: number) => Promise<boolean>;
  onClose: () => void;
}

function defaultsFor(groups: ModifierGroup[]): Selections {
  return Object.fromEntries(groups.map((g) => [g.id, g.options.filter((o) => o.default).map((o) => o.id)]));
}

function delta(cents: number, currency: string) {
  if (cents === 0) return null;
  return `${cents > 0 ? "+" : "−"}${formatPrice(Math.abs(cents), currency)}`;
}

export function OptionsDialog({ menu, item, initial, mode, size = "regular", busy, onSubmit, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const groups = item.modifierGroupIds.map((id) => getGroup(menu, id)).filter((g): g is ModifierGroup => !!g);
  const [picked, setPicked] = useState<Selections>(() =>
    initial ? Object.fromEntries(groups.map((g) => [g.id, initial[g.id] ?? []])) : defaultsFor(groups),
  );
  const [qty, setQty] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const kiosk = size === "kiosk";

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const missing = groups.filter((g) => (picked[g.id]?.length ?? 0) < g.min);
  const unitPrice =
    item.price +
    groups.reduce(
      (sum, g) => sum + (picked[g.id] ?? []).reduce((s, id) => s + (g.options.find((o) => o.id === id)?.priceDelta ?? 0), 0),
      0,
    );

  function toggle(group: ModifierGroup, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max === 1) return { ...prev, [group.id]: optionId ? [optionId] : [] };
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (current.length >= group.max) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missing.length > 0) {
      setShowErrors(true);
      document.getElementById(`group-${titleId}-${missing[0]!.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (await onSubmit(picked, qty)) dialog.current?.close();
  }

  const optionRow = `flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-4 has-[:checked]:border-pickle has-[:checked]:bg-lettuce has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-pickle border-line ${kiosk ? "min-h-16 text-lg" : "min-h-12"}`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className={`m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-hidden rounded-3xl bg-card p-0 text-char shadow-2xl ${kiosk ? "max-w-3xl" : "max-w-lg"}`}
    >
      <form onSubmit={submit} className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4">
          <div>
            <h2 id={titleId} className={`font-display font-extrabold tracking-tight ${kiosk ? "text-3xl" : "text-2xl"}`}>
              {mode === "edit" ? `Change ${item.name}` : item.name}
            </h2>
            {item.description && <p className="mt-1 text-char-soft">{item.description}</p>}
            {item.allergens.length > 0 && (
              <p className="mt-1 text-sm text-char-soft">Contains: {item.allergens.join(", ")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className={`${buttonClass("ghost", size)} shrink-0 px-3!`}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {groups.length === 0 && <p className="text-char-soft">No options for this item.</p>}
          {groups.map((group) => {
            const chosen = picked[group.id] ?? [];
            const radio = group.max === 1;
            const short = showErrors && chosen.length < group.min;
            const rule =
              group.min > 0
                ? group.min === group.max
                  ? `Required, choose ${group.min}`
                  : `Required, choose ${group.min}–${group.max}`
                : group.max === 1
                  ? "Optional"
                  : `Optional, up to ${group.max}`;
            return (
              <fieldset key={group.id} id={`group-${titleId}-${group.id}`} aria-invalid={short || undefined}>
                <legend className="flex w-full items-baseline justify-between gap-3">
                  <span className={`font-display font-bold ${kiosk ? "text-xl" : "text-lg"}`}>{group.name}</span>
                  <span className={`text-sm font-bold ${short ? "text-alert" : group.min > 0 ? "text-pickle" : "text-char-soft"}`}>
                    {short ? "Please choose" : rule}
                  </span>
                </legend>
                <div className={`mt-3 grid gap-2 ${kiosk ? "sm:grid-cols-2" : ""}`}>
                  {radio && group.min === 0 && (
                    <label className={optionRow}>
                      <input
                        type="radio"
                        name={group.id}
                        checked={chosen.length === 0}
                        onChange={() => toggle(group, "")}
                        className="h-5 w-5 accent-pickle"
                      />
                      <span className="flex-1">None</span>
                    </label>
                  )}
                  {group.options.map((option) => {
                    const checked = chosen.includes(option.id);
                    const full = !radio && !checked && chosen.length >= group.max;
                    return (
                      <label key={option.id} className={optionRow}>
                        <input
                          type={radio ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          disabled={full}
                          onChange={() => toggle(group, option.id)}
                          className="h-5 w-5 accent-pickle"
                        />
                        <span className="flex-1">{option.name}</span>
                        {delta(option.priceDelta, menu.currency) && (
                          <span className="text-char-soft tabular-nums">{delta(option.priceDelta, menu.currency)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-5 py-4">
          {mode === "add" ? (
            <div className="flex items-center gap-1" role="group" aria-label="Quantity">
              <button
                type="button"
                className={`${buttonClass("secondary", size)} w-12 px-0!`}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="One fewer"
              >
                –
              </button>
              <span className="w-10 text-center text-lg font-bold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className={`${buttonClass("secondary", size)} w-12 px-0!`}
                onClick={() => setQty((q) => Math.min(50, q + 1))}
                aria-label="One more"
              >
                +
              </button>
            </div>
          ) : (
            <span />
          )}
          <button type="submit" className={`${buttonClass("primary", size)} grow sm:grow-0`} disabled={busy}>
            {mode === "add" ? "Add to order" : "Save changes"}
            <span className="tabular-nums opacity-85">{formatPrice(unitPrice * qty, menu.currency)}</span>
          </button>
          {showErrors && missing.length > 0 && (
            <p className="w-full text-sm font-bold text-alert" role="alert">
              Choose {missing.map((g) => g.name.toLowerCase()).join(" and ")} to continue.
            </p>
          )}
        </footer>
      </form>
    </dialog>
  );
}
