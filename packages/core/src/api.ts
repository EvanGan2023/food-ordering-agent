/*
 * Shapes shared by the API server and the web apps.
 *
 * Endpoints (all JSON, under /api):
 *   GET    /health                            → Health
 *   GET    /menu                              → Menu
 *   GET    /settings                          → Settings
 *   PUT    /settings            Settings      → Settings
 *   POST   /sessions            { channel }   → SessionView
 *   GET    /sessions/:id                      → SessionView
 *   POST   /sessions/:id/message { text }     → MessageResponse   (runs the agent)
 *   POST   /sessions/:id/cart/add    AddItemInput                → SessionView
 *   POST   /sessions/:id/cart/update { lineId, qty?, modifiers? } → SessionView
 *   POST   /sessions/:id/cart/remove { lineId }                   → SessionView
 *   POST   /sessions/:id/cart/clear                               → SessionView
 *   POST   /sessions/:id/answers { questionId, value }            → SessionView
 *   POST   /sessions/:id/checkout { payment }                     → Order
 *   GET    /orders?status=active                                  → Order[]
 *   GET    /orders/by-code/:code                                  → Order
 *   GET    /orders/:id                                            → Order
 *   POST   /orders/:id/pay                                        → Order
 *   POST   /orders/:id/status { status }                          → Order
 *   POST   /speech/transcribe   multipart "audio"                  → { text }   (503 speech_unavailable without a key)
 *   GET    /speech/speak?text=...                                 → audio/mpeg stream
 *
 * Session messages include both the customer's text and the agent's reply.
 * PUT /settings replaces the whole settings object, including the full questions list.
 * Errors come back as { error: { code, message, ... } } with a 4xx status.
 */
import type { CartError, ChoiceOption, PricedCart, PricedLine } from "./cart";
import type { Answers, Channel, OrderQuestion } from "./questions";

export interface Health {
  ok: boolean;
  /** Whether the AI agent is configured. */
  agent: boolean;
  pos: string;
  /** stt "browser" means use the browser's own speech recognition; tts null means no spoken replies. */
  speech: { stt: string; tts: string | null };
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
}

/** A required choice the agent is waiting on; the UI shows the options as buttons. */
export interface ChoicePrompt {
  itemId: string;
  itemName: string;
  groupId: string;
  groupName: string;
  min: number;
  max: number;
  options: ChoiceOption[];
}

export interface SessionView {
  id: string;
  channel: Channel;
  status: "open" | "checked_out";
  cart: PricedCart;
  answers: Answers;
  /** Questions for this channel, in order, so the UI can show and answer them. */
  questions: OrderQuestion[];
  /** Required questions still unanswered; checkout is blocked until this is empty. */
  missingAnswers: string[];
  pendingChoice: ChoicePrompt | null;
  messages: ChatMessage[];
  orderId: string | null;
}

export interface MessageResponse {
  reply: string;
  session: SessionView;
}

/** online = paid in the ordering link; kiosk = paid at the kiosk or iPad; at_pickup = pay later with the pickup code. */
export type PaymentMethod = "online" | "kiosk" | "at_pickup";

export type OrderStatus = "awaiting_payment" | "paid" | "preparing" | "ready" | "collected";

export interface OrderAnswer {
  questionId: string;
  question: string;
  answer: string;
  sendToKitchen: boolean;
}

export interface Order {
  id: string;
  /** Short number called out at the counter, e.g. 101. */
  number: number;
  /** 4-digit code used to pay at the kiosk or counter. */
  pickupCode: string;
  channel: Channel;
  payment: PaymentMethod;
  status: OrderStatus;
  lines: PricedLine[];
  subtotal: number;
  currency: string;
  answers: OrderAnswer[];
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  restaurantName: string;
  agentEnabled: boolean;
  upsellEnabled: boolean;
  questions: OrderQuestion[];
}

export type ApiError =
  | CartError
  | { code: "not_found"; message: string }
  | { code: "bad_request"; message: string }
  | { code: "missing_answers"; questionIds: string[] }
  | { code: "agent_unavailable"; message: string }
  | { code: "speech_unavailable"; message: string }
  | { code: "session_closed" };
