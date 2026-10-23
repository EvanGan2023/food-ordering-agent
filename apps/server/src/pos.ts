import type { Order } from "@foa/core";

/** Where paid orders go to reach the kitchen. Square comes next; other POS systems plug in here too. */
export interface PosAdapter {
  name: string;
  submitOrder(order: Order): Promise<void>;
}

/** For local testing: orders stay in our database and show on the /kitchen screen. */
export const kitchenScreenPos: PosAdapter = {
  name: "kitchen-screen",
  async submitOrder() {},
};
