import { getGroup, getItem, orderTotal, type Menu, type Order, type PaymentMethod, type PricedLine } from "@foa/core";
import type { PosAdapter } from "../pos";
import type { SquareClient } from "./client";

interface SquareLineItem {
  quantity: string;
  catalog_object_id?: string;
  name?: string;
  base_price_money?: { amount: number; currency: string };
  modifiers?: ({ catalog_object_id: string } | { name: string; base_price_money: { amount: number; currency: string } })[];
}

/** Square applies the seller's taxes (included in prices or added on top) to catalog items. */
const pricingOptions = { auto_apply_taxes: true };

/** Order lines for Square: catalog lines where the menu came from Square, named lines otherwise. */
export function toSquareLineItems(lines: PricedLine[], menu: Menu, currency: string): SquareLineItem[] {
  const money = (amount: number) => ({ amount, currency });
  return lines.map((line): SquareLineItem => {
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
}

/** Our placed order as a Square order. */
export function toSquareOrder(order: Order, menu: Menu, locationId: string) {
  const answer = (id: string) => order.answers.find((a) => a.questionId === id)?.answer;
  const kitchenNotes = order.answers
    .filter((a) => a.sendToKitchen && a.questionId !== "name")
    .map((a) => `${a.question} ${a.answer}`)
    .join(" | ");
  return {
    location_id: locationId,
    reference_id: `#${order.number}`,
    source: { name: "AI ordering" },
    line_items: toSquareLineItems(order.lines, menu, order.currency),
    pricing_options: pricingOptions,
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

interface SquareCalculated {
  order: {
    taxes?: { uid?: string; type?: "ADDITIVE" | "INCLUSIVE" }[];
    line_items?: { applied_taxes?: { tax_uid: string; applied_money?: { amount: number } }[] }[];
  };
}

/** The tax Square adds on top of the prices; taxes included in the prices don't change what the customer pays. */
export function addedTax(order: SquareCalculated["order"]): number {
  const added = new Set(order.taxes?.filter((t) => t.type === "ADDITIVE").map((t) => t.uid));
  return (order.line_items ?? [])
    .flatMap((line) => line.applied_taxes ?? [])
    .filter((t) => added.has(t.tax_uid))
    .reduce((sum, t) => sum + (t.applied_money?.amount ?? 0), 0);
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

    async quote(lines) {
      const { order } = await client.request<SquareCalculated>("POST", "/v2/orders/calculate", {
        order: { location_id: locationId, line_items: toSquareLineItems(lines, menu, menu.currency), pricing_options: pricingOptions },
      });
      return { tax: addedTax(order) };
    },

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
        // What the customer was charged; if Square's total differs, staff see the balance there.
        amount_money: { amount: orderTotal(order), currency: order.currency },
        order_id: order.pos.orderId,
        location_id: locationId,
      });
      return { paymentId: payment.id };
    },
  };
}
