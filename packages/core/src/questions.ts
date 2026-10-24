import { z } from "zod";

export const Channel = z.enum(["online", "kiosk", "voice"]);
export type Channel = z.infer<typeof Channel>;

/** A question the restaurant owner wants asked on every order, e.g. "Dine in or takeaway?". */
export const OrderQuestion = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(["choice", "yes_no", "text", "number", "time"]),
  /** Only for type "choice". */
  options: z.array(z.string().min(1)).default([]),
  required: z.boolean().default(false),
  channels: z.array(Channel).min(1),
  when: z.enum(["start", "before_checkout"]).default("before_checkout"),
  sendToKitchen: z.boolean().default(true),
});
export type OrderQuestion = z.infer<typeof OrderQuestion>;
export type OrderQuestionInput = z.input<typeof OrderQuestion>;

/** Answers keyed by question id, stored in normalized form. */
export type Answers = Record<string, string>;

export type AnswerResult = { ok: true; value: string } | { ok: false; reason: string };

const YES = ["yes", "y", "yeah", "yep", "sure", "please", "true"];
const NO = ["no", "n", "nope", "no thanks", "false"];

/** Checks an answer against the question's type and returns the stored form. */
export function normalizeAnswer(question: OrderQuestion, raw: string): AnswerResult {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "answer is empty" };

  switch (question.type) {
    case "choice": {
      const match = question.options.find((o) => o.toLowerCase() === value.toLowerCase());
      return match ? { ok: true, value: match } : { ok: false, reason: `must be one of: ${question.options.join(", ")}` };
    }
    case "yes_no": {
      const lower = value.toLowerCase();
      if (YES.includes(lower)) return { ok: true, value: "Yes" };
      if (NO.includes(lower)) return { ok: true, value: "No" };
      return { ok: false, reason: "must be yes or no" };
    }
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? { ok: true, value: String(n) } : { ok: false, reason: "must be a number" };
    }
    case "time": {
      if (/^(asap|as soon as possible|now)$/i.test(value)) return { ok: true, value: "ASAP" };
      const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
      return match
        ? { ok: true, value: `${match[1]!.padStart(2, "0")}:${match[2]}` }
        : { ok: false, reason: 'must be "ASAP" or a time like 12:30' };
    }
    case "text":
      return value.length <= 200 ? { ok: true, value } : { ok: false, reason: "must be 200 characters or fewer" };
  }
}

export function questionsFor(questions: OrderQuestion[], channel: Channel): OrderQuestion[] {
  return questions.filter((q) => q.channels.includes(channel));
}

/** Required questions for this channel that still have no answer. */
export function unansweredRequired(questions: OrderQuestion[], answers: Answers, channel: Channel): OrderQuestion[] {
  return questionsFor(questions, channel).filter((q) => q.required && !answers[q.id]);
}

export const defaultQuestions: OrderQuestion[] = [
  {
    id: "name",
    text: "What name should we put on the order?",
    type: "text",
    required: true,
    channels: ["online", "kiosk"],
    when: "start",
    sendToKitchen: true,
  },
  {
    id: "dine-in",
    text: "Dine in or takeaway?",
    type: "choice",
    options: ["Dine in", "Takeaway"],
    required: true,
    channels: ["online", "kiosk", "voice"],
    when: "before_checkout",
    sendToKitchen: true,
  },
  {
    id: "pickup-time",
    text: "When would you like to pick it up?",
    type: "time",
    required: true,
    channels: ["online"],
    when: "before_checkout",
    sendToKitchen: true,
  },
  {
    // Passed to staff as written; the agent never answers allergy questions itself.
    id: "allergy-note",
    text: "Any allergies or dietary needs the kitchen should know about?",
    type: "text",
    required: false,
    channels: ["online", "kiosk"],
    when: "before_checkout",
    sendToKitchen: true,
  },
  {
    id: "cutlery",
    text: "Do you need cutlery?",
    type: "yes_no",
    required: false,
    channels: ["online"],
    when: "before_checkout",
    sendToKitchen: true,
  },
].map((q) => OrderQuestion.parse(q));
