"use client";

import { useState } from "react";
import { formatPrice, getItem, type Menu, type PaymentMethod, type PricedLine, type SessionView } from "@foa/core";
import { QuestionsPanel } from "../QuestionsPanel";
import type { Size } from "../ui";

interface Props {
  session: SessionView;
  menu: Menu;
  busy?: boolean;
  size?: Size;
  actions: { payment: PaymentMethod; label: string; primary?: boolean }[];
  onQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onEdit: (line: PricedLine) => void;
  onAnswer: (questionId: string, value: string) => Promise<string | null>;
  onCheckout: (payment: PaymentMethod) => void;
  /** Phone layout: a close button for the expanded sheet. */
  onCollapse?: () => void;
  className?: string;
}

/** Why checkout is blocked, in words the customer can act on. */
export function checkoutBlocker(session: SessionView): string | null {
  if (session.cart.lines.length === 0) return "Add something to your order first.";
  if (session.missingAnswers.length > 0) {
    const names = session.questions.filter((q) => session.missingAnswers.includes(q.id)).map((q) => q.text);
    return `Answer the order details first: ${names.join(" ")}`;
  }
  return null;
}

/** The live order: lines appear as the agent adds them, and a tap opens quick fixes. */
export function OrderCard({
  session,
  menu,
  busy,
  size = "regular",
  actions,
  onQty,
  onRemove,
  onEdit,
  onAnswer,
  onCheckout,
  onCollapse,
  className = "",
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const kiosk = size === "kiosk";
  const { cart } = session;
  const count = cart.lines.reduce((n, l) => n + l.qty, 0);
  const blocker = checkoutBlocker(session);
  const total = formatPrice(cart.subtotal + session.tax, cart.currency);
  const fix = `rounded-full border-[1.5px] border-char/15 bg-card font-medium transition-colors hover:border-char disabled:opacity-45 ${
    kiosk ? "min-h-16 px-6 text-xl" : "min-h-11 px-4"
  }`;

  return (
    <section
      aria-label="Your order"
      className={`flex min-h-0 flex-col rounded-[2rem] border border-line bg-card shadow-[0_4px_24px_rgb(43_33_28/0.06)] ${
        kiosk ? "p-8" : "p-5"
      } ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`font-semibold ${kiosk ? "text-3xl" : "text-xl"}`}>Your order</h2>
        <div className="flex items-center gap-3">
          <span className={`text-char-soft ${kiosk ? "text-xl" : "text-sm"}`} aria-live="polite">
            {count === 0 ? "Empty" : `${count} item${count === 1 ? "" : "s"}`}
          </span>
          {onCollapse && (
            <button type="button" onClick={onCollapse} className="rounded-full px-3 py-1 text-sm font-medium hover:bg-char/5">
              Hide
            </button>
          )}
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${kiosk ? "mt-6" : "mt-4"}`}>
        {cart.lines.length === 0 ? (
          <p className={`py-6 text-center text-char-soft ${kiosk ? "text-2xl" : ""}`}>
            Items appear here as you talk. Tap any line to change it.
          </p>
        ) : (
          <ul className={`flex flex-col ${kiosk ? "gap-3" : "gap-2"}`}>
            {cart.lines.map((line) => {
              const expanded = open === line.lineId;
              const editable = (getItem(menu, line.itemId)?.modifierGroupIds.length ?? 0) > 0;
              return (
                <li key={line.lineId} className="line-in rounded-[1.25rem] border border-[#efe7de] bg-[#fbf8f4]">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : line.lineId)}
                    className={`flex w-full items-center gap-4 text-left ${kiosk ? "px-6 py-5" : "px-4 py-3"}`}
                  >
                    <span className={`font-semibold tabular-nums ${kiosk ? "text-2xl" : ""}`}>{line.qty}×</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${kiosk ? "text-2xl" : ""}`}>{line.name}</span>
                      {line.options.length > 0 && (
                        <span className={`block text-char-soft ${kiosk ? "mt-1 text-xl" : "text-sm"}`}>{line.options.join(" · ")}</span>
                      )}
                    </span>
                    <span className={`font-medium tabular-nums ${kiosk ? "text-2xl" : ""}`}>{formatPrice(line.lineTotal, cart.currency)}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`shrink-0 text-char-soft transition-transform ${expanded ? "rotate-90" : ""} ${kiosk ? "size-7" : "size-5"}`}
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className={`flex flex-wrap items-center gap-2 ${kiosk ? "px-6 pb-5" : "px-4 pb-3"}`}>
                      <button
                        type="button"
                        className={fix}
                        disabled={busy}
                        onClick={() => onQty(line.lineId, line.qty - 1)}
                        aria-label={line.qty === 1 ? `Remove ${line.name}` : `One fewer ${line.name}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={fix}
                        disabled={busy || line.qty >= 50}
                        onClick={() => onQty(line.lineId, line.qty + 1)}
                        aria-label={`One more ${line.name}`}
                      >
                        +
                      </button>
                      {editable && (
                        <button type="button" className={fix} disabled={busy} onClick={() => onEdit(line)}>
                          Change options
                        </button>
                      )}
                      <button
                        type="button"
                        className={`${fix} ml-auto border-transparent! text-alert`}
                        disabled={busy}
                        onClick={() => onRemove(line.lineId)}
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

        {cart.lines.length > 0 && session.questions.length > 0 && (
          <div className={kiosk ? "mt-5" : "mt-4"}>
            <QuestionsPanel
              size={size}
              questions={session.questions}
              answers={session.answers}
              missing={session.missingAnswers}
              busy={busy}
              onAnswer={onAnswer}
            />
          </div>
        )}
      </div>

      <div className={`border-t border-[#efe7de] ${kiosk ? "mt-5 pt-6" : "mt-4 pt-4"}`}>
        <div className={kiosk ? "flex items-center gap-5" : "flex flex-col gap-3"}>
          <div className={kiosk ? "flex flex-col" : "flex items-baseline justify-between"} aria-live="polite">
            <span className={`text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>
              Total{session.tax > 0 && ` (incl. ${formatPrice(session.tax, cart.currency)} tax)`}
            </span>
            <span className={`font-bold tracking-tight tabular-nums ${kiosk ? "text-4xl" : "text-2xl"}`}>{total}</span>
          </div>
          <div className={kiosk ? "flex min-w-0 flex-1 gap-2" : "grid grid-cols-2 gap-2"}>
            {actions.map((a) => (
              <button
                key={a.payment}
                type="button"
                disabled={busy || !!blocker}
                aria-describedby={blocker ? "order-blocker" : undefined}
                onClick={() => onCheckout(a.payment)}
                className={`rounded-full font-semibold transition-colors disabled:cursor-not-allowed ${
                  kiosk ? "h-24 flex-1 px-10 text-3xl" : "min-h-13 px-4 text-base"
                } ${
                  blocker
                    ? "bg-[#f1ebe4] text-char-soft"
                    : a.primary
                      ? "bg-pickle text-white hover:bg-pickle-dark"
                      : "border-[1.5px] border-char/15 bg-card hover:border-char"
                }`}
              >
                {a.primary && kiosk && !blocker ? `${a.label} ${total}` : a.label}
              </button>
            ))}
          </div>
        </div>
        {blocker && cart.lines.length > 0 && (
          <p id="order-blocker" className={`mt-3 text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>
            {blocker}
          </p>
        )}
      </div>
    </section>
  );
}
