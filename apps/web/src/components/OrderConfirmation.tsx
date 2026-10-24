import { formatPrice, type Order } from "@foa/core";
import { statusLabel, type Size } from "./ui";

interface Props {
  order: Order;
  size?: Size;
  children?: React.ReactNode;
}

const paymentNote: Record<Order["payment"], string> = {
  online: "Paid online (demo, no money taken).",
  kiosk: "Paid at the kiosk (demo, no money taken).",
  at_pickup: "Pay at the counter when you collect. Show your pickup code.",
};

function paymentText(order: Order) {
  if (order.payment === "at_pickup" && order.status !== "awaiting_payment") return "Paid at pickup (demo, no money taken).";
  return paymentNote[order.payment];
}

export function OrderConfirmation({ order, size = "regular", children }: Props) {
  const kiosk = size === "kiosk";
  const unpaid = order.status === "awaiting_payment";
  return (
    <section aria-labelledby="confirm-title" className="mx-auto w-full max-w-md">
      <div className="docket px-6 pt-6 text-center shadow-[0_1px_0_var(--color-line)]" role="status">
        <h2 id="confirm-title" className="text-lg font-bold text-char-soft">
          {unpaid ? "Order placed" : "Order confirmed"}
        </h2>
        <p className="mt-1 text-char-soft">Your order number</p>
        <p
          className={`stamp-in font-display font-extrabold leading-none tracking-tighter tabular-nums text-pickle ${
            kiosk ? "text-[9rem]" : "text-[6.5rem]"
          }`}
        >
          {order.number}
        </p>
        <p className="mt-2 inline-block rounded-full bg-lettuce px-3 py-1 font-bold text-pickle">{statusLabel[order.status]}</p>

        <div className="docket-rule mt-5 flex items-center justify-between pt-4 text-left">
          <div>
            <p className="text-sm text-char-soft">Pickup code</p>
            <p className="font-display text-3xl font-extrabold tracking-[0.2em] tabular-nums">{order.pickupCode}</p>
          </div>
          <p className="max-w-[12rem] text-right text-sm text-char-soft">{paymentText(order)}</p>
        </div>

        <ul className="docket-rule mt-4 space-y-2 pt-4 text-left">
          {order.lines.map((line) => (
            <li key={line.lineId} className="flex gap-3">
              <span className="font-bold tabular-nums">{line.qty}×</span>
              <span className="flex-1">
                {line.name}
                {line.options.length > 0 && <span className="block text-sm text-char-soft">{line.options.join(", ")}</span>}
              </span>
              <span className="tabular-nums">{formatPrice(line.lineTotal, order.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="docket-rule mt-4 flex items-baseline justify-between pt-3 text-left">
          <span className="font-bold">Total</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{formatPrice(order.subtotal, order.currency)}</span>
        </div>
      </div>
      {children && <div className="mt-6 flex flex-col items-center gap-3">{children}</div>}
    </section>
  );
}
