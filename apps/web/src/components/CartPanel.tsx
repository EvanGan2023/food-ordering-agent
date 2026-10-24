"use client";

import { formatPrice, getItem, type Menu, type PricedCart, type PricedLine } from "@foa/core";
import { buttonClass, type Size } from "./ui";

interface Props {
  cart: PricedCart;
  menu: Menu | null;
  busy?: boolean;
  size?: Size;
  /** Hides the fix-it controls, e.g. on a confirmation. */
  readOnly?: boolean;
  onQty?: (lineId: string, qty: number) => void;
  onRemove?: (lineId: string) => void;
  onEdit?: (line: PricedLine) => void;
  empty?: React.ReactNode;
}

export function CartPanel({ cart, menu, busy, size = "regular", readOnly, onQty, onRemove, onEdit, empty }: Props) {
  const kiosk = size === "kiosk";
  const count = cart.lines.reduce((n, l) => n + l.qty, 0);
  const small = `${buttonClass("secondary", size)} ${kiosk ? "h-14 w-14" : "h-11 w-11"} px-0! text-xl!`;

  return (
    <section aria-label="Your order" className="docket px-4 pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className={`font-display font-extrabold tracking-tight ${kiosk ? "text-2xl" : "text-xl"}`}>Your order</h2>
        <span className="text-char-soft" aria-live="polite">
          {count === 0 ? "Empty" : `${count} item${count === 1 ? "" : "s"}`}
        </span>
      </div>

      {cart.lines.length === 0 ? (
        <div className="py-6 text-char-soft">{empty ?? "Nothing here yet."}</div>
      ) : (
        <ul className="mt-3 divide-y-2 divide-dashed divide-line">
          {cart.lines.map((line) => {
            const editable = !readOnly && (menu ? (getItem(menu, line.itemId)?.modifierGroupIds.length ?? 0) > 0 : false);
            return (
              <li key={line.lineId} className="py-3">
                <div className="flex items-start gap-3">
                  <span className={`font-display font-extrabold tabular-nums ${kiosk ? "text-xl" : "text-lg"}`}>
                    {line.qty}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${kiosk ? "text-lg" : ""}`}>{line.name}</p>
                    {line.options.length > 0 && <p className="text-sm text-char-soft">{line.options.join(", ")}</p>}
                  </div>
                  <span className="font-bold tabular-nums">{formatPrice(line.lineTotal, cart.currency)}</span>
                </div>
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                    <button
                      type="button"
                      className={small}
                      disabled={busy}
                      onClick={() => onQty?.(line.lineId, line.qty - 1)}
                      aria-label={line.qty === 1 ? `Remove ${line.name}` : `One fewer ${line.name}`}
                    >
                      –
                    </button>
                    <button
                      type="button"
                      className={small}
                      disabled={busy || line.qty >= 50}
                      onClick={() => onQty?.(line.lineId, line.qty + 1)}
                      aria-label={`One more ${line.name}`}
                    >
                      +
                    </button>
                    {editable && (
                      <button
                        type="button"
                        className={`${buttonClass("secondary", size)} px-4!`}
                        disabled={busy}
                        onClick={() => onEdit?.(line)}
                        aria-label={`Change options for ${line.name}`}
                      >
                        Change
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${buttonClass("danger", size)} ml-auto px-2!`}
                      disabled={busy}
                      onClick={() => onRemove?.(line.lineId)}
                      aria-label={`Remove ${line.name}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="docket-rule mt-2 flex items-baseline justify-between pt-3" aria-live="polite">
        <span className="font-bold">Total</span>
        <span className={`font-display font-extrabold tabular-nums ${kiosk ? "text-3xl" : "text-2xl"}`}>
          {formatPrice(cart.subtotal, cart.currency)}
        </span>
      </div>
    </section>
  );
}
