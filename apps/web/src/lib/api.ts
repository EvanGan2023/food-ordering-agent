import type {
  AddItemInput,
  ApiError,
  Channel,
  Health,
  Menu,
  MessageResponse,
  Order,
  OrderStatus,
  PaymentMethod,
  SessionView,
  Settings,
  Selections,
} from "@foa/core";

/** API errors plus the one the browser produces itself when the server can't be reached. */
export type ClientError = ApiError | { code: "network"; message: string };

export class ApiRequestError extends Error {
  constructor(
    readonly error: ClientError,
    readonly status: number,
  ) {
    super("message" in error ? error.message : error.code);
    this.name = "ApiRequestError";
  }
}

async function request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  // FormData goes as multipart; the browser sets the boundary header itself.
  const form = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined || form ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError({ code: "network", message: "Can't reach the ordering server." }, 0);
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error =
      data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object"
        ? (data.error as ClientError)
        : ({ code: "network", message: `Server error (${res.status}).` } as const);
    throw new ApiRequestError(error, res.status);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<Health>("GET", "/health"),
  menu: () => request<Menu>("GET", "/menu"),
  settings: () => request<Settings>("GET", "/settings"),
  saveSettings: (settings: Settings) => request<Settings>("PUT", "/settings", settings),

  createSession: (channel: Channel) => request<SessionView>("POST", "/sessions", { channel }),
  session: (id: string) => request<SessionView>("GET", `/sessions/${enc(id)}`),
  message: (id: string, text: string) => request<MessageResponse>("POST", `/sessions/${enc(id)}/message`, { text }),
  addItem: (id: string, input: AddItemInput) => request<SessionView>("POST", `/sessions/${enc(id)}/cart/add`, input),
  updateLine: (id: string, lineId: string, changes: { qty?: number; modifiers?: Selections }) =>
    request<SessionView>("POST", `/sessions/${enc(id)}/cart/update`, { lineId, ...changes }),
  removeLine: (id: string, lineId: string) =>
    request<SessionView>("POST", `/sessions/${enc(id)}/cart/remove`, { lineId }),
  clearCart: (id: string) => request<SessionView>("POST", `/sessions/${enc(id)}/cart/clear`, {}),
  answer: (id: string, questionId: string, value: string) =>
    request<SessionView>("POST", `/sessions/${enc(id)}/answers`, { questionId, value }),
  checkout: (id: string, payment: PaymentMethod) =>
    request<Order>("POST", `/sessions/${enc(id)}/checkout`, { payment }),

  activeOrders: () => request<Order[]>("GET", "/orders?status=active"),
  orderByCode: (code: string) => request<Order>("GET", `/orders/by-code/${enc(code)}`),
  payOrder: (orderId: string) => request<Order>("POST", `/orders/${enc(orderId)}/pay`, {}),
  setOrderStatus: (orderId: string, status: OrderStatus) =>
    request<Order>("POST", `/orders/${enc(orderId)}/status`, { status }),

  transcribe: (audio: Blob, filename: string) => {
    const form = new FormData();
    form.append("audio", audio, filename);
    return request<{ text: string }>("POST", "/speech/transcribe", form);
  },
};

/** Streams as audio/mpeg, so it can be used directly as an <audio> source. */
export const speakUrl = (text: string) => `/api/speech/speak?text=${enc(text.slice(0, 600))}`;

export function errorCode(err: unknown): ClientError["code"] | "unknown" {
  return err instanceof ApiRequestError ? err.error.code : "unknown";
}

/** Plain-language text for an error, written for customers. */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return "Something went wrong. Try again.";
  const e = err.error;
  switch (e.code) {
    case "network":
      return e.message;
    case "speech_unavailable":
      return e.message;
    case "agent_unavailable":
      return "The ordering assistant is offline right now. You can still order by tapping the menu.";
    case "out_of_stock":
      return `${e.name} is sold out right now.`;
    case "unavailable_now":
      return `${e.name} is only available ${e.availability.start}–${e.availability.end}.`;
    case "missing_choice":
      return `Choose ${e.groupName.toLowerCase()} first.`;
    case "too_many_choices":
      return `You can pick up to ${e.max} for that option.`;
    case "invalid_quantity":
      return "That quantity isn't allowed.";
    case "empty_cart":
      return "Your order is empty.";
    case "missing_answers":
      return "Answer the order details first.";
    case "session_closed":
      return "This order has already been placed. Start a new order to keep going.";
    case "unknown_line":
      return "That item is no longer in your order.";
    case "unknown_item":
    case "unknown_modifier_group":
    case "invalid_option":
      return "That item or option isn't on the menu any more.";
    case "not_found":
    case "bad_request":
      return e.message;
  }
}
