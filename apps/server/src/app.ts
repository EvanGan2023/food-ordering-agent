import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { newOrderState, runAgent } from "@foa/agent";
import {
  addItem,
  Channel,
  defaultQuestions,
  emptyCart,
  OrderQuestion,
  priceCart,
  questionsFor,
  removeItem,
  unansweredRequired,
  updateItem,
  validateForCheckout,
  normalizeAnswer,
  type ApiError,
  type CartError,
  type Menu,
  type Order,
  type OrderStatus,
  type SessionView,
  type Settings,
} from "@foa/core";
import type { LanguageModel } from "ai";
import type { PosAdapter } from "./pos";
import { SpeechError, type SpeechProvider } from "./speech";
import type { SessionRecord, Store } from "./store";

export interface AppDeps {
  store: Store;
  menu: Menu;
  pos: PosAdapter;
  /** Null when no LLM key is configured; the tap menu still works. */
  model: LanguageModel | null;
  /** Null when no speech key is configured; the web app falls back to the browser's speech recognition. */
  speech?: SpeechProvider | null;
  now?: () => Date;
  log?: boolean;
}

const SettingsSchema = z.object({
  restaurantName: z.string().trim().min(1).max(80),
  agentEnabled: z.boolean(),
  upsellEnabled: z.boolean(),
  questions: z
    .array(OrderQuestion)
    .max(20)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, "question ids must be unique")
    .refine((qs) => qs.every((q) => q.type !== "choice" || q.options.length >= 2), "choice questions need 2+ options"),
});

const Selections = z.record(z.string(), z.array(z.string()));
const bodies = {
  session: z.object({ channel: Channel }),
  message: z.object({ text: z.string().trim().min(1).max(500) }),
  add: z.object({ itemId: z.string(), qty: z.number().int().optional(), modifiers: Selections.optional() }),
  update: z.object({ lineId: z.string(), qty: z.number().int().optional(), modifiers: Selections.optional() }),
  remove: z.object({ lineId: z.string() }),
  answer: z.object({ questionId: z.string(), value: z.string() }),
  checkout: z.object({ payment: z.enum(["online", "kiosk", "at_pickup"]) }),
  status: z.object({ status: z.enum(["preparing", "ready", "collected"]) }),
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_SPOKEN_CHARS = 600;

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "preparing",
  preparing: "ready",
  ready: "collected",
};

class ApiFailure extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422 | 502 | 503,
    readonly body: ApiError,
  ) {
    super(body.code);
  }
}

const notFound = (what: string) => new ApiFailure(404, { code: "not_found", message: `${what} not found` });
const cartFailure = (error: CartError) =>
  new ApiFailure(error.code === "unknown_line" || error.code === "unknown_item" ? 404 : 422, error);

async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const json = await c.req.json().catch(() => {
    throw new ApiFailure(400, { code: "bad_request", message: "body must be JSON" });
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiFailure(400, { code: "bad_request", message: z.prettifyError(parsed.error) });
  return parsed.data;
}

export function createApp(deps: AppDeps) {
  const { store, menu, pos } = deps;
  const now = deps.now ?? (() => new Date());

  // One request at a time per session, so a chat turn and a tap can't overwrite each other.
  const locks = new Map<string, Promise<unknown>>();
  function withSessionLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    locks.set(id, next);
    next.finally(() => locks.get(id) === next && locks.delete(id)).catch(() => {});
    return next;
  }

  async function settings(): Promise<Settings> {
    return (
      (await store.getSettings()) ?? {
        restaurantName: "Patty & Co.",
        agentEnabled: true,
        upsellEnabled: true,
        questions: defaultQuestions,
      }
    );
  }

  async function view(session: SessionRecord): Promise<SessionView> {
    const questions = questionsFor((await settings()).questions, session.channel);
    return {
      id: session.id,
      channel: session.channel,
      status: session.status,
      cart: priceCart(session.state.cart, menu),
      answers: session.state.answers,
      questions,
      missingAnswers: unansweredRequired(questions, session.state.answers, session.channel).map((q) => q.id),
      pendingChoice: session.state.pendingChoice,
      messages: session.messages,
      orderId: session.orderId,
    };
  }

  async function openSession(id: string): Promise<SessionRecord> {
    const session = await store.getSession(id);
    if (!session) throw notFound("session");
    if (session.status !== "open") throw new ApiFailure(409, { code: "session_closed" });
    return session;
  }

  /** Loads the session, applies a change, saves it and returns the new view. */
  function mutateSession(c: Context, change: (session: SessionRecord) => Promise<void> | void) {
    const id = c.req.param("id")!;
    return withSessionLock(id, async () => {
      const session = await openSession(id);
      await change(session);
      await store.saveSession(session);
      return c.json(await view(session));
    });
  }

  async function loadOrder(id: string): Promise<Order> {
    const order = await store.getOrder(id);
    if (!order) throw notFound("order");
    return order;
  }

  const app = new Hono().basePath("/api");
  if (deps.log) app.use(logger());

  app.onError((err, c) => {
    if (err instanceof ApiFailure) return c.json({ error: err.body }, err.status);
    console.error(err);
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });

  app.get("/health", (c) =>
    c.json({
      ok: true,
      agent: deps.model !== null,
      pos: pos.name,
      speech: { stt: deps.speech?.name ?? "browser", tts: deps.speech?.name ?? null },
    }),
  );

  function requireSpeech(): SpeechProvider {
    if (!deps.speech) {
      throw new ApiFailure(503, {
        code: "speech_unavailable",
        message: "No speech key is set on the server (ELEVENLABS_API_KEY).",
      });
    }
    return deps.speech;
  }

  const speechFailure = (err: unknown) => {
    console.error("speech request failed:", err);
    return new ApiFailure(502, {
      code: "speech_unavailable",
      message: err instanceof SpeechError && err.status === 401 ? "The speech API key was rejected." : "Speech is having trouble right now.",
    });
  };

  // Push-to-talk audio from the browser (multipart field "audio") → { text }.
  app.post("/speech/transcribe", async (c) => {
    const speech = requireSpeech();
    const form = await c.req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      throw new ApiFailure(400, { code: "bad_request", message: 'send the recording as multipart field "audio"' });
    }
    if (audio.size > MAX_AUDIO_BYTES) throw new ApiFailure(400, { code: "bad_request", message: "recording too long" });
    const filename = audio instanceof File && audio.name ? audio.name : "speech.webm";
    try {
      return c.json({ text: await speech.transcribe(audio, filename) });
    } catch (err) {
      throw speechFailure(err);
    }
  });

  // GET so an <audio> element can stream it directly: /api/speech/speak?text=...
  app.get("/speech/speak", async (c) => {
    const speech = requireSpeech();
    const text = (c.req.query("text") ?? "").trim();
    if (!text || text.length > MAX_SPOKEN_CHARS) {
      throw new ApiFailure(400, { code: "bad_request", message: `text must be 1-${MAX_SPOKEN_CHARS} characters` });
    }
    try {
      const audio = await speech.speak(text);
      return new Response(audio.body, { headers: { "content-type": audio.contentType, "cache-control": "no-store" } });
    } catch (err) {
      throw speechFailure(err);
    }
  });

  app.get("/menu", (c) => c.json(menu));

  app.get("/settings", async (c) => c.json(await settings()));

  app.put("/settings", async (c) => {
    const next = await readBody(c, SettingsSchema);
    await store.saveSettings(next);
    return c.json(next);
  });

  app.post("/sessions", async (c) => {
    const { channel } = await readBody(c, bodies.session);
    const session = await store.createSession(channel, newOrderState());
    return c.json(await view(session), 201);
  });

  app.get("/sessions/:id", async (c) => {
    const session = await store.getSession(c.req.param("id"));
    if (!session) throw notFound("session");
    return c.json(await view(session));
  });

  app.post("/sessions/:id/message", async (c) => {
    const { text } = await readBody(c, bodies.message);
    const id = c.req.param("id");
    return withSessionLock(id, async () => {
      const session = await openSession(id);
      const current = await settings();
      if (!current.agentEnabled) {
        throw new ApiFailure(503, { code: "agent_unavailable", message: "The assistant is turned off. Tap to order." });
      }
      if (!deps.model) {
        throw new ApiFailure(503, {
          code: "agent_unavailable",
          message: "No AI key is set on the server (ANTHROPIC_API_KEY). Tap to order.",
        });
      }

      let result;
      try {
        result = await runAgent({
          model: deps.model,
          menu,
          restaurantName: current.restaurantName,
          upsellEnabled: current.upsellEnabled,
          channel: session.channel,
          questions: questionsFor(current.questions, session.channel),
          state: session.state,
          history: session.messages.map(({ role, text }) => ({ role, text })),
          userText: text,
          now,
        });
      } catch (err) {
        console.error("agent turn failed:", err);
        throw new ApiFailure(502, {
          code: "agent_unavailable",
          message: "The assistant is having trouble right now. Tap to order.",
        });
      }

      const at = now().toISOString();
      session.state = result.state;
      session.messages = [
        ...session.messages,
        { role: "user", text, at },
        { role: "assistant", text: result.reply, at },
      ];
      await store.saveSession(session);
      return c.json({ reply: result.reply, session: await view(session) });
    });
  });

  app.post("/sessions/:id/cart/add", async (c) => {
    const body = await readBody(c, bodies.add);
    return mutateSession(c, (session) => {
      const result = addItem(session.state.cart, menu, body, now());
      if (!result.ok) throw cartFailure(result.error);
      session.state.cart = result.value.cart;
      if (session.state.pendingChoice?.itemId === body.itemId) session.state.pendingChoice = null;
    });
  });

  app.post("/sessions/:id/cart/update", async (c) => {
    const { lineId, ...changes } = await readBody(c, bodies.update);
    return mutateSession(c, (session) => {
      const result = updateItem(session.state.cart, menu, lineId, changes);
      if (!result.ok) throw cartFailure(result.error);
      session.state.cart = result.value.cart;
    });
  });

  app.post("/sessions/:id/cart/remove", async (c) => {
    const { lineId } = await readBody(c, bodies.remove);
    return mutateSession(c, (session) => {
      const result = removeItem(session.state.cart, lineId);
      if (!result.ok) throw cartFailure(result.error);
      session.state.cart = result.value.cart;
    });
  });

  app.post("/sessions/:id/cart/clear", (c) =>
    mutateSession(c, (session) => {
      session.state.cart = emptyCart();
      session.state.pendingChoice = null;
    }),
  );

  app.post("/sessions/:id/answers", async (c) => {
    const { questionId, value } = await readBody(c, bodies.answer);
    const questions = (await settings()).questions;
    return mutateSession(c, (session) => {
      const question = questionsFor(questions, session.channel).find((q) => q.id === questionId);
      if (!question) throw notFound("question");
      const result = normalizeAnswer(question, value);
      if (!result.ok) throw new ApiFailure(422, { code: "bad_request", message: result.reason });
      session.state.answers = { ...session.state.answers, [questionId]: result.value };
    });
  });

  app.post("/sessions/:id/checkout", async (c) => {
    const { payment } = await readBody(c, bodies.checkout);
    const id = c.req.param("id");
    return withSessionLock(id, async () => {
      const session = await openSession(id);
      const checked = validateForCheckout(session.state.cart, menu, now());
      if (!checked.ok) throw cartFailure(checked.error);

      const questions = questionsFor((await settings()).questions, session.channel);
      const missing = unansweredRequired(questions, session.state.answers, session.channel);
      if (missing.length) throw new ApiFailure(422, { code: "missing_answers", questionIds: missing.map((q) => q.id) });

      const order = await store.createOrder({
        channel: session.channel,
        payment,
        // Demo payments: online and kiosk count as paid; pay-at-pickup waits for the code.
        status: payment === "at_pickup" ? "awaiting_payment" : "paid",
        lines: checked.value.lines,
        subtotal: checked.value.subtotal,
        currency: checked.value.currency,
        answers: questions
          .filter((q) => session.state.answers[q.id])
          .map((q) => ({
            questionId: q.id,
            question: q.text,
            answer: session.state.answers[q.id]!,
            sendToKitchen: q.sendToKitchen,
          })),
      });
      await pos.submitOrder(order);

      session.status = "checked_out";
      session.orderId = order.id;
      await store.saveSession(session);
      return c.json(order, 201);
    });
  });

  app.get("/orders", async (c) => c.json(await store.listActiveOrders()));

  app.get("/orders/by-code/:code", async (c) => {
    const code = c.req.param("code");
    if (!/^\d{4}$/.test(code)) throw new ApiFailure(400, { code: "bad_request", message: "code must be 4 digits" });
    const order = await store.findUnpaidOrderByCode(code);
    if (!order) throw notFound("unpaid order with that code");
    return c.json(order);
  });

  app.get("/orders/:id", async (c) => c.json(await loadOrder(c.req.param("id"))));

  app.post("/orders/:id/pay", async (c) => {
    const order = await loadOrder(c.req.param("id"));
    if (order.status !== "awaiting_payment") {
      throw new ApiFailure(409, { code: "bad_request", message: "order is already paid" });
    }
    return c.json(await store.setOrderStatus(order, "paid"));
  });

  app.post("/orders/:id/status", async (c) => {
    const { status } = await readBody(c, bodies.status);
    const order = await loadOrder(c.req.param("id"));
    if (NEXT_STATUS[order.status] !== status) {
      throw new ApiFailure(409, {
        code: "bad_request",
        message: `can't move an order from ${order.status} to ${status}`,
      });
    }
    return c.json(await store.setOrderStatus(order, status));
  });

  return app;
}
