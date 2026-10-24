import type { PaymentMethod, SessionView } from "@foa/core";
import { buttonClass, type Size } from "./ui";

interface Props {
  session: SessionView;
  busy?: boolean;
  size?: Size;
  actions: { payment: PaymentMethod; label: string; variant: "primary" | "secondary" }[];
  onCheckout: (payment: PaymentMethod) => void;
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

export function CheckoutActions({ session, busy, size = "regular", actions, onCheckout }: Props) {
  const blocker = checkoutBlocker(session);
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${actions.length > 1 ? "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" : ""}`}>
        {actions.map((a) => (
          <button
            key={a.payment}
            type="button"
            className={`${buttonClass(a.variant, size)} w-full`}
            disabled={busy || !!blocker}
            aria-describedby={blocker ? "checkout-blocker" : undefined}
            onClick={() => onCheckout(a.payment)}
          >
            {a.label}
          </button>
        ))}
      </div>
      {blocker && (
        <p id="checkout-blocker" className="text-sm text-char-soft">
          {blocker}
        </p>
      )}
    </div>
  );
}
