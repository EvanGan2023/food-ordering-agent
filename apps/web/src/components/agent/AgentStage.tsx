"use client";

import type { SessionView } from "@foa/core";
import type { AgentInput, AgentPhase } from "@/lib/use-agent-input";
import type { Notice } from "@/lib/use-order-session";
import type { Size } from "../ui";
import { ChoiceButtons, OfferButtons } from "./ChoiceButtons";

const statusText: Record<AgentPhase, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Building your order",
  speaking: "Speaking",
  offline: "Assistant offline",
};

export function AuraOrb({ phase, className }: { phase: AgentPhase; className: string }) {
  return (
    <div className={`aura ${phase} ${className}`} aria-hidden="true">
      <span className="aura-ring-outer" />
      <span className="aura-ring" />
      <span className="aura-core" />
      <span className="aura-swirl" />
    </div>
  );
}

interface Props {
  session: SessionView;
  input: AgentInput;
  notice: Notice | null;
  /** Problems with the mic or spoken replies, shown under the caption. */
  hint: string | null;
  size?: Size;
  /** Hides the orb, e.g. on a phone while the order is open. */
  compact?: boolean;
  onDismissNotice: () => void;
}

/** The orb, what's being said, and the agent's quick choices. */
export function AgentStage({ session, input, notice, hint, size = "regular", compact, onDismissNotice }: Props) {
  const kiosk = size === "kiosk";
  const { phase } = input;
  const hasLines = session.cart.lines.length > 0;
  const lastReply = session.messages.findLast((m) => m.role === "assistant")?.text;
  const handling = phase === "listening" || phase === "thinking";
  const agentText =
    input.liveReply ??
    (phase === "offline" && !lastReply
      ? "The ordering assistant is offline right now. Please order at the counter."
      : (lastReply ?? "Hi! What can I get you today?"));
  // Until the turn ends, the order's choices and offers are still the last turn's.
  const waiting = handling || input.busy;
  const choice = !waiting ? session.pendingChoice : null;
  // The agent guessed at something the customer said; they confirm before it goes in the order.
  const confirm = !waiting && !choice ? session.pendingConfirm : null;
  const offers = !waiting && !choice && !confirm && session.pendingOffers.length ? session.pendingOffers : null;
  const send = (text: string) => void input.send(text);

  // Choice buttons need the room, so the orb shrinks while they show.
  const busyStage = hasLines || !!choice || !!offers;
  const orbSize = kiosk
    ? busyStage
      ? "size-[15rem] landscape:size-[10rem]"
      : "size-[22.5rem] landscape:size-[14rem]"
    : busyStage
      ? choice || offers
        ? "size-[min(16vh,160px)]"
        : "size-[min(22vh,200px)]"
      : "size-[min(30vh,280px)]";

  return (
    <section
      aria-label="Ordering assistant"
      className={`flex min-h-0 flex-1 flex-col items-center justify-center-safe overflow-y-auto text-center *:shrink-0 ${kiosk ? "gap-8 px-10 py-6" : "gap-5 px-5 py-4"}`}
    >
      {!compact && <AuraOrb phase={phase} className={`shrink-0 ${orbSize}`} />}
      <p className={`uppercase tracking-[0.16em] text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>{statusText[phase]}</p>

      <div
        role="log"
        aria-live="polite"
        className={`flex w-full max-w-[56rem] min-w-0 flex-col ${kiosk ? "min-h-44 gap-5" : compact ? "gap-2" : "min-h-24 gap-3"}`}
      >
        {handling ? (
          <p className={`text-char-soft ${kiosk ? "text-3xl leading-snug" : "text-lg leading-snug"}`}>
            {input.userText ? <>&ldquo;{input.userText}&rdquo;</> : phase === "listening"
                ? input.speech.ready
                  ? "Go ahead, I'm listening…"
                  : "Starting the mic…"
                : "One moment…"}
          </p>
        ) : (
          <p
            className={`font-medium tracking-tight whitespace-pre-wrap ${
              kiosk
                ? "text-[3.1rem] leading-[1.18]"
                : compact
                  ? "text-lg leading-snug lg:text-3xl"
                  : "text-2xl leading-snug sm:text-3xl"
            }`}
          >
            {agentText}
          </p>
        )}
      </div>

      {choice && (
        <ChoiceButtons
          key={`${choice.itemId}:${choice.groups.map((g) => g.groupId).join(",")}`}
          choice={choice}
          currency={session.cart.currency}
          size={size}
          onSend={send}
        />
      )}

      {offers && (
        <OfferButtons
          key={offers.map((o) => o.lineId).join(",")}
          offers={offers}
          currency={session.cart.currency}
          size={size}
          onSend={send}
        />
      )}

      {confirm && (
        <div className="flex flex-col items-center gap-3" role="group" aria-label="Confirm the order change">
          <p className={`text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>{confirm.changes.join(" · ")}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void input.send("Yes")}
              className={`rounded-full bg-pickle font-semibold text-white hover:bg-pickle-dark ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`}
            >
              Yes, add it
            </button>
            <button
              type="button"
              onClick={() => void input.send("No")}
              className={`rounded-full border-[1.5px] border-char/20 bg-card font-semibold hover:border-char ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`}
            >
              No
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className={`flex max-w-xl items-center gap-3 rounded-2xl px-4 py-2.5 text-left ${
            notice.kind === "offline" ? "bg-bun-soft" : "bg-alert-soft text-alert"
          } ${kiosk ? "text-xl" : "text-sm"}`}
        >
          <p className="flex-1">{notice.text}</p>
          <button type="button" onClick={onDismissNotice} aria-label="Dismiss" className="grid size-9 place-items-center rounded-full hover:bg-char/5">
            ✕
          </button>
        </div>
      )}
      {hint && !notice && (
        <p role="status" className={`max-w-xl text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>
          {hint}
        </p>
      )}
    </section>
  );
}
