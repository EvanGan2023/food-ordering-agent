"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice, type Order } from "@foa/core";
import { api, describeError, errorCode } from "@/lib/api";
import { OrderConfirmation } from "./OrderConfirmation";
import { buttonClass, statusLabel } from "./ui";

/** Kiosk flow for customers who ordered online and chose "Pay at pickup". */
export function PickupCodeDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  async function lookUp(value: string) {
    setBusy(true);
    setError(null);
    try {
      setOrder(await api.orderByCode(value));
    } catch (err) {
      setError(errorCode(err) === "not_found" ? `No order found for code ${value}. Check the code and try again.` : describeError(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      setOrder(await api.payOrder(order.id));
      setPaid(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy) return;
    const next = (code + digit).slice(0, 4);
    setCode(next);
    if (next.length === 4) void lookUp(next);
  }

  const key = `${buttonClass("secondary", "kiosk")} h-20`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="pickup-title"
      onClose={onClose}
      className="m-auto max-h-[94dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl bg-paper p-6 text-char shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="pickup-title" className="font-display text-3xl font-extrabold tracking-tight">
          {paid ? "Paid, thanks!" : order ? `Order ${order.number}` : "Enter your pickup code"}
        </h2>
        <button type="button" className={`${buttonClass("ghost", "kiosk")} px-4!`} onClick={() => dialog.current?.close()} aria-label="Close">
          ✕
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-alert-soft px-4 py-3 text-lg">
          {error}
        </p>
      )}

      {!order && (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 4) void lookUp(code);
          }}
        >
          <label htmlFor="pickup-code" className="text-lg text-char-soft">
            The 4-digit code from your online order
          </label>
          <input
            id="pickup-code"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
              setCode(digits);
              if (digits.length === 4) void lookUp(digits);
            }}
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            maxLength={4}
            className="mt-2 h-20 w-full rounded-2xl border-2 border-line bg-card text-center font-display text-5xl font-extrabold tracking-[0.5em] tabular-nums outline-none focus:border-pickle"
          />
          <div className="mt-4 grid grid-cols-3 gap-3" aria-label="Keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" className={`${key} text-3xl!`} onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button type="button" className={`${key} text-xl!`} onClick={() => setCode("")} aria-label="Clear code">
              Clear
            </button>
            <button type="button" className={`${key} text-3xl!`} onClick={() => press("0")}>
              0
            </button>
            <button type="button" className={`${key} text-xl!`} onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Delete last digit">
              ⌫
            </button>
          </div>
        </form>
      )}

      {order && paid && (
        <div className="mt-6">
          <OrderConfirmation order={order} size="kiosk">
            <button type="button" className={buttonClass("primary", "kiosk")} onClick={() => dialog.current?.close()}>
              Done
            </button>
          </OrderConfirmation>
        </div>
      )}

      {order && !paid && (
        <div className="mt-6 space-y-5">
          <ul className="docket space-y-2 px-5! pt-5 text-lg">
            {order.lines.map((line) => (
              <li key={line.lineId} className="flex gap-3">
                <span className="font-bold">{line.qty}×</span>
                <span className="flex-1">
                  {line.name}
                  {line.options.length > 0 && <span className="block text-base text-char-soft">{line.options.join(", ")}</span>}
                </span>
                <span className="tabular-nums">{formatPrice(line.lineTotal, order.currency)}</span>
              </li>
            ))}
            <li className="docket-rule flex justify-between pt-3 font-bold">
              <span>Total</span>
              <span className="font-display text-2xl tabular-nums">{formatPrice(order.subtotal, order.currency)}</span>
            </li>
          </ul>
          {order.status === "awaiting_payment" ? (
            <button type="button" className={`${buttonClass("primary", "kiosk")} w-full`} disabled={busy} onClick={() => void pay()}>
              Pay now (demo) {formatPrice(order.subtotal, order.currency)}
            </button>
          ) : (
            <p className="rounded-2xl bg-lettuce px-4 py-3 text-lg font-bold text-pickle">
              Already paid. Status: {statusLabel[order.status]}.
            </p>
          )}
          <button
            type="button"
            className={`${buttonClass("ghost", "kiosk")} w-full`}
            onClick={() => {
              setOrder(null);
              setCode("");
              setError(null);
            }}
          >
            Enter a different code
          </button>
        </div>
      )}
    </dialog>
  );
}
