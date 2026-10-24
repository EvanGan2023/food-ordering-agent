"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderAnswer, OrderStatus } from "@foa/core";
import { BrandMark } from "@/components/ui";
import { api, describeError } from "@/lib/api";

const POLL_MS = 2000;

const columns: { status: OrderStatus; title: string }[] = [
  { status: "awaiting_payment", title: "Awaiting payment" },
  { status: "paid", title: "New" },
  { status: "preparing", title: "Preparing" },
  { status: "ready", title: "Ready" },
];

const nextStep: Partial<Record<OrderStatus, { label: string; status: OrderStatus }>> = {
  paid: { label: "Start preparing", status: "preparing" },
  preparing: { label: "Mark ready", status: "ready" },
  ready: { label: "Collected", status: "collected" },
};

const channelLabel: Record<Order["channel"], string> = { online: "Online", kiosk: "Kiosk", voice: "Phone" };

function isAllergy(answer: OrderAnswer) {
  return /allerg|dietary/i.test(`${answer.questionId} ${answer.question}`);
}

function age(createdAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function KitchenBoard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOrders(await api.activeOrders());
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function act(order: Order, call: () => Promise<Order>) {
    setWorking(order.id);
    try {
      const updated = await call();
      setOrders((list) =>
        (list ?? []).flatMap((o) => (o.id !== updated.id ? [o] : updated.status === "collected" ? [] : [updated])),
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-char text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8 w-8" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Kitchen</h1>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-bold">Demo POS stand-in</span>
        </div>
        <p className="text-sm text-white/70" aria-live="polite">
          {error ? <span className="font-bold text-bun">{error} Retrying…</span> : `Refreshes every ${POLL_MS / 1000} s`}
        </p>
      </header>

      <div className="grid flex-1 gap-4 overflow-x-auto px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const list = (orders ?? []).filter((o) => o.status === column.status);
          return (
            <section key={column.status} aria-labelledby={`col-${column.status}`} className="flex min-w-0 flex-col rounded-2xl bg-white/5 p-3">
              <h2 id={`col-${column.status}`} className="flex items-baseline justify-between px-1 pb-3 font-display text-xl font-bold">
                {column.title}
                <span className="text-base font-normal text-white/60">{list.length}</span>
              </h2>
              <ul className="space-y-3">
                {list.map((order) => (
                  <li key={order.id}>
                    <Ticket order={order} now={now} busy={working === order.id} onAct={(call) => void act(order, call)} />
                  </li>
                ))}
                {orders && list.length === 0 && <li className="px-1 text-white/40">No orders</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Ticket({
  order,
  now,
  busy,
  onAct,
}: {
  order: Order;
  now: number;
  busy: boolean;
  onAct: (call: () => Promise<Order>) => void;
}) {
  const name = order.answers.find((a) => a.questionId === "name")?.answer;
  const notes = order.answers.filter((a) => a.sendToKitchen && a.questionId !== "name");
  const step = nextStep[order.status];

  return (
    <article className="docket px-4 pt-3 text-char" aria-label={`Order ${order.number}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-4xl font-extrabold leading-none tabular-nums">{order.number}</p>
          {name && <p className="mt-1 text-lg font-bold">{name}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="font-bold">{channelLabel[order.channel]}</p>
          <p className="text-char-soft tabular-nums">{age(order.createdAt, now)} ago</p>
        </div>
      </div>

      <ul className="docket-rule mt-3 space-y-1.5 pt-3">
        {order.lines.map((line) => (
          <li key={line.lineId} className="flex gap-2 text-lg leading-snug">
            <span className="font-extrabold tabular-nums">{line.qty}×</span>
            <span>
              <span className="font-bold">{line.name}</span>
              {line.options.length > 0 && <span className="block text-base text-char-soft">{line.options.join(", ")}</span>}
            </span>
          </li>
        ))}
      </ul>

      {notes.length > 0 && (
        <dl className="docket-rule mt-3 space-y-1.5 pt-3 text-sm">
          {notes.map((a) =>
            isAllergy(a) ? (
              <div key={a.questionId} className="rounded-lg border-2 border-alert bg-alert-soft px-2 py-1.5 text-alert">
                <dt className="font-bold">Allergy note</dt>
                <dd className="text-base font-bold">{a.answer}</dd>
              </div>
            ) : (
              <div key={a.questionId} className="flex gap-2">
                <dt className="text-char-soft">{a.question}</dt>
                <dd className="ml-auto text-right font-bold">{a.answer}</dd>
              </div>
            ),
          )}
        </dl>
      )}

      {order.pos?.error && (
        <p role="alert" className="mt-3 rounded-lg border-2 border-alert bg-alert-soft px-2 py-1.5 text-sm text-alert">
          <span className="font-bold">Not in {order.pos.name === "square" ? "Square" : "the POS"}:</span> {order.pos.error}
        </p>
      )}

      {order.status === "awaiting_payment" ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm text-char-soft">Code {order.pickupCode}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(() => api.payOrder(order.id))}
            className="min-h-11 rounded-full border-2 border-char/20 px-4 font-bold hover:border-pickle disabled:opacity-50"
          >
            Mark paid
          </button>
        </div>
      ) : (
        step && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAct(() => api.setOrderStatus(order.id, step.status))}
            className="mt-3 min-h-12 w-full rounded-full bg-pickle px-4 text-lg font-bold text-white hover:bg-pickle-dark disabled:opacity-50"
          >
            {step.label}
          </button>
        )
      )}
    </article>
  );
}
