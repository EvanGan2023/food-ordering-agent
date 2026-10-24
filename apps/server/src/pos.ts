import type { Order, PosRef } from "@foa/core";

/**
 * Where orders go to reach the kitchen. The server saves whatever these return on the order
 * (`order.pos`); if one throws, the order still stands and the error shows on the kitchen screen.
 */
export interface PosAdapter {
  name: string;
  /** A new order, paid or not. */
  submitOrder(order: Order): Promise<Omit<PosRef, "name"> | void>;
  /** The order was paid (online, at the kiosk or at the counter). */
  orderPaid?(order: Order): Promise<Omit<PosRef, "name"> | void>;
}

/** For local testing: orders stay in our database and show on the /kitchen screen. */
export const kitchenScreenPos: PosAdapter = {
  name: "kitchen-screen",
  async submitOrder() {},
};
