"use client";

import { useEffect, useRef, useState } from "react";
import type { PricedLine } from "@foa/core";
import { AgentStage, AuraOrb } from "@/components/agent/AgentStage";
import { OrderCard } from "@/components/agent/OrderCard";
import { VoiceBar } from "@/components/agent/VoiceBar";
import { LineDialog } from "@/components/LineDialog";
import { OrderConfirmation } from "@/components/OrderConfirmation";
import { PickupCodeDialog } from "@/components/PickupCodeDialog";
import { Brand, buttonClass, restaurantName, Spinner } from "@/components/ui";
import { useSpokenReplies, useVoiceReplies } from "@/lib/speech";
import { useAgentInput } from "@/lib/use-agent-input";
import { useOrderSession } from "@/lib/use-order-session";

const RESET_SECONDS = 20;

/**
 * Built for a portrait screen (a monitor turned 90°, e.g. 1080×1920): orb and captions at eye
 * level, the talk bar and order within reach below. A landscape tablet gets the order on the right.
 */
export function KioskApp() {
  const s = useOrderSession("kiosk");
  const [editing, setEditing] = useState<PricedLine | null>(null);
  const [pickup, setPickup] = useState(false);
  const [started, setStarted] = useState(false);
  // Spoken replies start on for every customer; they can mute them.
  const voice = useVoiceReplies(null, true);
  const canSpeak = !!s.health?.speech.tts;
  useSpokenReplies(s.reply, voice, canSpeak);
  const input = useAgentInput(s, voice);
  const [countdown, setCountdown] = useState(RESET_SECONDS);
  const { order, reset } = s;

  const newCustomer = useRef(() => {});
  newCustomer.current = () => {
    voice.setEnabled(true);
    setStarted(false);
    setEditing(null);
    void reset();
  };

  // Scale the whole kiosk with the screen: rem-based sizes are drawn for 1080×1920 (portrait).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("kiosk-scale");
    return () => root.classList.remove("kiosk-scale");
  }, []);

  // After a kiosk order, the screen returns to the start for the next customer.
  useEffect(() => {
    if (!order) return;
    setCountdown(RESET_SECONDS);
    const tick = setInterval(() => setCountdown((n) => Math.max(n - 1, 0)), 1000);
    const done = setTimeout(() => newCustomer.current(), RESET_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [order]);

  if (s.loadError) {
    return (
      <div className="grid h-dvh place-items-center p-8 text-center" role="alert">
        <div>
          <p className="text-3xl">{s.loadError}</p>
          <button type="button" className={`${buttonClass("primary", "kiosk")} mt-6`} onClick={() => void s.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const session = s.session;
  if (!session || !s.menu) {
    return (
      <div className="grid h-dvh place-items-center text-2xl">
        <Spinner label="Getting the kiosk ready…" />
      </div>
    );
  }

  if (order) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 py-10">
        <OrderConfirmation order={order} size="kiosk">
          <p className="text-2xl text-char-soft">We&apos;ll call your number at the counter when it&apos;s ready.</p>
          <button type="button" className={buttonClass("primary", "kiosk")} onClick={() => newCustomer.current()} disabled={s.busy}>
            Start new order
          </button>
          <p className="text-xl text-char-soft" aria-live="off">
            Starting over in {countdown} s
          </p>
        </OrderConfirmation>
      </main>
    );
  }

  const welcome = !started && session.messages.length === 0 && session.cart.lines.length === 0;
  const voiceToggle = canSpeak ? voice : null;
  const hint = input.speech.error ?? voice.error;

  const header = (
    <header className="flex shrink-0 items-center justify-between gap-4 px-10 pt-10 landscape:px-8 landscape:pt-6">
      <Brand href={null} size="kiosk" name={restaurantName(s.menu?.name) || undefined} />
      <div className="flex gap-3">
        {!welcome && (
          <button type="button" className={`${buttonClass("secondary", "kiosk")} whitespace-nowrap`} onClick={() => newCustomer.current()}>
            Start over
          </button>
        )}
        <button type="button" className={`${buttonClass("secondary", "kiosk")} whitespace-nowrap`} onClick={() => setPickup(true)}>
          Have a pickup code?
        </button>
      </div>
    </header>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {header}

      {welcome ? (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            if (!s.assistantDown) input.speech.start();
          }}
          className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-12 overflow-hidden px-16 pb-20 text-center landscape:gap-6 landscape:pb-8"
        >
          <AuraOrb phase={s.assistantDown ? "offline" : "idle"} className="size-[30rem] shrink-0 landscape:size-[16rem]" />
          <span className="text-[4.75rem] landscape:text-[3.5rem] leading-[1.04] font-bold tracking-tight">
            Just say what
            <br />
            you&apos;d like.
          </span>
          <span className="max-w-3xl text-[1.75rem] leading-snug text-char-soft">
            {s.assistantDown
              ? "The ordering assistant is offline right now. Please order at the counter."
              : "No scrolling. Tell us your whole order in one go, and we'll ask about anything we need."}
          </span>
          {!s.assistantDown && (
            <span className="soft-pulse mt-4 flex h-24 items-center gap-4 rounded-full bg-bun px-12 text-3xl font-semibold">
              <svg viewBox="0 0 24 24" className="size-9" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Tap to start
            </span>
          )}
        </button>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <AgentStage
              session={session}
              input={input}
              notice={s.notice}
              hint={hint}
              size="kiosk"
              onDismissNotice={s.dismissNotice}
            />
            <VoiceBar input={input} size="kiosk" disabled={s.assistantDown} voice={voiceToggle} />
          </div>
          <OrderCard
            session={session}
            menu={s.menu}
            busy={s.busy}
            size="kiosk"
            actions={[{ payment: "kiosk", label: "Pay", primary: true }]}
            onQty={(lineId, qty) => void s.setQty(lineId, qty)}
            onRemove={(lineId) => void s.removeLine(lineId)}
            onEdit={setEditing}
            onAnswer={s.answer}
            onCheckout={(payment) => void s.checkout(payment)}
            className={`mx-8 mb-8 shrink-0 portrait:min-h-0 portrait:max-h-[46%] landscape:my-6 landscape:ml-0 landscape:w-[35rem]`}
          />
        </div>
      )}

      <LineDialog line={editing} menu={s.menu} busy={s.busy} size="kiosk" onClose={() => setEditing(null)} onEdit={s.updateOptions} />
      {pickup && <PickupCodeDialog onClose={() => setPickup(false)} />}
    </div>
  );
}
