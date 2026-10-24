import { getGroup, getItem, type Menu, type Order, type PaymentMethod } from "@foa/core";
import type { PosAdapter } from "../pos";
import type { SquareClient } from "./client";

interface SquareLineItem {
  quantity: string;
  catalog_object_id?: string;
  name?: string;
  base_price_money?: { amount: number; currency: string };
  modifiers?: ({ catalog_object_id: string } | { name: string; base_price_money: { amount: number; currency: string } })[];
}

/** Our placed order as a Square order: catalog lines where the menu came from Square, named lines otherwise. */
export function toSquareOrder(order: Order, menu: Menu, locationId: string) {
  const money = (amount: number) => ({ amount, currency: order.currency });
  const line_items = order.lines.map((line): SquareLineItem => {
    const item = getItem(menu, line.itemId);
    let catalogId = item?.posId;
    const modifiers: NonNullable<SquareLineItem["modifiers"]> = [];
    let adHocPrice = item?.price ?? line.unitPrice;
    for (const [groupId, optionIds] of Object.entries(line.modifiers)) {
      const group = getGroup(menu, groupId);
      for (const optionId of optionIds) {
        const option = group?.options.find((o) => o.id === optionId);
        if (!option) continue;
        // The chosen variation (e.g. Large) is the item Square sells.
        if (group?.posVariations && option.posId) {
          catalogId = option.posId;
          adHocPrice += option.priceDelta;
        } else if (option.posId) modifiers.push({ catalog_object_id: option.posId });
        else modifiers.push({ name: option.name, base_price_money: money(option.priceDelta) });
      }
    }
    return {
      quantity: String(line.qty),
      ...(catalogId ? { catalog_object_id: catalogId } : { name: line.name, base_price_money: money(adHocPrice) }),
      ...(modifiers.length ? { modifiers } : {}),
    };
  });

  const answer = (id: string) => order.answers.find((a) => a.questionId === id)?.answer;
  const kitchenNotes = order.answers
    .filter((a) => a.sendToKitchen && a.questionId !== "name")
    .map((a) => `${a.question} ${a.answer}`)
    .join(" | ");
  return {
    location_id: locationId,
    reference_id: `#${order.number}`,
    source: { name: "AI ordering" },
    line_items,
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickup_details: {
          recipient: { display_name: answer("name") || `Order #${order.number}` },
          schedule_type: "ASAP",
          ...(kitchenNotes ? { note: kitchenNotes.slice(0, 500) } : {}),
        },
      },
    ],
  };
}

const PAID_AT: Record<PaymentMethod, string> = {
  online: "Paid online (AI ordering)",
  kiosk: "Paid at kiosk (AI ordering)",
  at_pickup: "Paid at counter (AI ordering)",
};

/**
 * Sends orders to Square. Square shows an API order to staff only once it's paid, so the order
 * is created at checkout and the payment recorded when it's paid.
 * Payments are recorded as external for now; card and Square Terminal payments come next.
 */
export function createSquarePos(client: SquareClient, menu: Menu): PosAdapter {
  const locationId = client.config.locationId;
  return {
    name: "square",

    async submitOrder(order) {
      const { order: created } = await client.request<{ order: { id: string; total_money?: { amount: number; currency: string } } }>(
        "POST",
        "/v2/orders",
        { idempotency_key: `order-${order.id}`, order: toSquareOrder(order, menu, locationId) },
      );
      return { orderId: created.id, total: created.total_money?.amount, currency: created.total_money?.currency };
    },

    async orderPaid(order) {
      if (!order.pos?.orderId) throw new Error("The order isn't in Square yet.");
      const { payment } = await client.request<{ payment: { id: string } }>("POST", "/v2/payments", {
        idempotency_key: `pay-${order.id}`,
        source_id: "EXTERNAL",
        external_details: { type: "OTHER", source: PAID_AT[order.payment] },
        amount_money: { amount: order.pos.total ?? order.subtotal, currency: order.pos.currency ?? order.currency },
        order_id: order.pos.orderId,
        location_id: locationId,
      });
      return { paymentId: payment.id };
    },
  };
}
