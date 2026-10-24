import { randomInt, randomUUID } from "node:crypto";
import type { OrderState } from "@foa/agent";
import type { Channel, ChatMessage, Order, OrderStatus, Settings } from "@foa/core";
import type { Db } from "./db";

export interface SessionRecord {
  id: string;
  channel: Channel;
  status: "open" | "checked_out";
  state: OrderState;
  messages: ChatMessage[];
  orderId: string | null;
  createdAt: string;
}

export type NewOrder = Omit<Order, "id" | "number" | "pickupCode" | "createdAt" | "updatedAt">;

const ACTIVE_WINDOW_HOURS = 12;

export class Store {
  constructor(private readonly db: Db) {}

  async getSettings(): Promise<Settings | null> {
    const [row] = await this.db.query<{ data: Settings }>("SELECT data FROM settings WHERE id = 'restaurant'");
    return row?.data ?? null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.query(
      `INSERT INTO settings (id, data) VALUES ('restaurant', $1)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(settings)],
    );
  }

  async createSession(channel: Channel, state: OrderState): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(),
      channel,
      status: "open",
      state,
      messages: [],
      orderId: null,
      createdAt: new Date().toISOString(),
    };
    await this.db.query("INSERT INTO sessions (id, data) VALUES ($1, $2)", [session.id, JSON.stringify(session)]);
    return session;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const [row] = await this.db.query<{ data: SessionRecord }>("SELECT data FROM sessions WHERE id = $1", [id]);
    return row?.data ?? null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.db.query("UPDATE sessions SET data = $2, updated_at = now() WHERE id = $1", [
      session.id,
      JSON.stringify(session),
    ]);
  }

  async createOrder(input: NewOrder): Promise<Order> {
    const [seq] = await this.db.query<{ n: number }>("SELECT nextval('order_number_seq')::int AS n");
    const now = new Date().toISOString();
    const order: Order = {
      ...input,
      id: randomUUID(),
      number: seq!.n,
      pickupCode: await this.uniquePickupCode(),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.query(
      "INSERT INTO orders (id, number, pickup_code, status, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)",
      [order.id, order.number, order.pickupCode, order.status, JSON.stringify(order), now],
    );
    return order;
  }

  async getOrder(id: string): Promise<Order | null> {
    const [row] = await this.db.query<{ data: Order }>("SELECT data FROM orders WHERE id = $1", [id]);
    return row?.data ?? null;
  }

  async findUnpaidOrderByCode(code: string): Promise<Order | null> {
    const [row] = await this.db.query<{ data: Order }>(
      `SELECT data FROM orders WHERE pickup_code = $1 AND status = 'awaiting_payment'
       ORDER BY created_at DESC LIMIT 1`,
      [code],
    );
    return row?.data ?? null;
  }

  async listActiveOrders(): Promise<Order[]> {
    const rows = await this.db.query<{ data: Order }>(
      `SELECT data FROM orders
       WHERE status <> 'collected' AND created_at > now() - interval '${ACTIVE_WINDOW_HOURS} hours'
       ORDER BY created_at ASC`,
    );
    return rows.map((row) => row.data);
  }

  async setOrderStatus(order: Order, status: OrderStatus): Promise<Order> {
    const updated: Order = { ...order, status, updatedAt: new Date().toISOString() };
    await this.db.query("UPDATE orders SET status = $2, data = $3, updated_at = $4 WHERE id = $1", [
      order.id,
      status,
      JSON.stringify(updated),
      updated.updatedAt,
    ]);
    return updated;
  }

  /** Saves changes to an order other than its status, e.g. its POS reference. */
  async saveOrder(order: Order): Promise<Order> {
    const updated: Order = { ...order, updatedAt: new Date().toISOString() };
    await this.db.query("UPDATE orders SET data = $2, updated_at = $3 WHERE id = $1", [order.id, JSON.stringify(updated), updated.updatedAt]);
    return updated;
  }

  /** A 4-digit code no unpaid order is using right now. */
  private async uniquePickupCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(randomInt(0, 10_000)).padStart(4, "0");
      if (!(await this.findUnpaidOrderByCode(code))) return code;
    }
    throw new Error("could not find a free pickup code");
  }
}
