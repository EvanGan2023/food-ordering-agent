import Link from "next/link";
import type { OrderStatus } from "@foa/core";

export type Size = "regular" | "kiosk";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45";

export function buttonClass(variant: "primary" | "secondary" | "ghost" | "danger" = "primary", size: Size = "regular") {
  const sizing = size === "kiosk" ? "min-h-14 px-7 text-lg" : "min-h-11 px-5 text-base";
  const look = {
    primary: "bg-pickle text-white hover:bg-pickle-dark",
    secondary: "border-2 border-char/15 bg-card text-char hover:border-pickle hover:text-pickle",
    ghost: "text-char-soft hover:bg-char/5 hover:text-char",
    danger: "text-alert hover:bg-alert-soft",
  }[variant];
  return `${base} ${sizing} ${look}`;
}

/** Stacked bun–patty–bun glyph; deliberately simple so it can't be mistaken for another chain's mark. */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="3" y="4" width="26" height="9" rx="4.5" fill="var(--color-bun)" />
      <rect x="2" y="15" width="28" height="5" rx="2.5" fill="var(--color-char)" />
      <rect x="4" y="22" width="24" height="6" rx="3" fill="var(--color-bun)" />
      <circle cx="11" cy="8" r="1" fill="#fff" />
      <circle cx="17" cy="7" r="1" fill="#fff" />
      <circle cx="22" cy="9" r="1" fill="#fff" />
    </svg>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-bun-soft px-2.5 py-0.5 text-sm font-bold text-char" title="Fictional restaurant for testing">
      Demo
    </span>
  );
}

export function Brand({ href = "/", size = "regular" }: { href?: string | null; size?: Size }) {
  const content = (
    <>
      <BrandMark className={size === "kiosk" ? "h-10 w-10" : "h-7 w-7"} />
      <span className={`font-display font-extrabold tracking-tight ${size === "kiosk" ? "text-3xl" : "text-xl"}`}>
        Patty &amp; Co.
      </span>
      <DemoBadge />
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-2 rounded-lg">
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-2">{content}</div>
  );
}

export const statusLabel: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid, sent to kitchen",
  preparing: "Being prepared",
  ready: "Ready to collect",
  collected: "Collected",
};

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-char-soft">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
      {label}
    </span>
  );
}
