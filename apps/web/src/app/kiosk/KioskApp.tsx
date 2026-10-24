"use client";

import { useEffect, useRef, useState } from "react";
import { CartPanel } from "@/components/CartPanel";
import { ChatInput } from "@/components/ChatInput";
import { ChatThread } from "@/components/ChatThread";
import { CheckoutActions } from "@/components/CheckoutActions";
import { LineDialog, type DialogTarget } from "@/components/LineDialog";
import { Notice } from "@/components/Notice";
import { OrderConfirmation } from "@/components/OrderConfirmation";
import { PickupCodeDialog } from "@/components/PickupCodeDialog";
import { QuestionsPanel } from "@/components/QuestionsPanel";
import { TapMenu } from "@/components/TapMenu";
import { VoiceRepliesToggle } from "@/components/VoiceRepliesToggle";
import { Brand, buttonClass, Spinner } from "@/components/ui";
import { useSpokenReplies, useVoiceReplies } from "@/lib/speech";
import { useOrderSession } from "@/lib/use-order-session";

const RESET_SECONDS = 20;

export function KioskApp() {
  const s = useOrderSession("kiosk");
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [pickup, setPickup] = useState(false);
  const voice = useVoiceReplies("foa:voice-replies:kiosk");
  const canSpeak = !!s.health?.speech.tts;
  useSpokenReplies(s.lastReply, voice, canSpeak);
  const [countdown, setCountdown] = useState(RESET_SECONDS);
  const { order, reset } = s;

  // After a kiosk order, the screen returns to the start for the next customer.
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (!order) return;
    setCountdown(RESET_SECONDS);
    const tick = setInterval(() => setCountdown((n) => Math.max(n - 1, 0)), 1000);
    const done = setTimeout(() => void resetRef.current(), RESET_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [order]);

  if (s.loadError) {
    return (
      <div className="grid h-dvh place-items-center p-8 text-center" role="alert">
        <div>
          <p className="text-2xl">{s.loadError}</p>
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
      <div className="grid h-dvh place-items-center text-xl">
        <Spinner label="Getting the kiosk ready…" />
      </div>
    );
  }

  if (order) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10">
        <OrderConfirmation order={order} size="kiosk">
          <p className="text-xl text-char-soft">We&apos;ll call your number at the counter when it&apos;s ready.</p>
          <button type="button" className={buttonClass("primary", "kiosk")} onClick={() => void reset()} disabled={s.busy}>
            Start new order
          </button>
          <p className="text-char-soft" aria-live="off">
            Starting over in {countdown} s
          </p>
        </OrderConfirmation>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <main className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5 lg:overflow-y-auto lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Brand href={null} size="kiosk" />
          <button type="button" className={buttonClass("secondary", "kiosk")} onClick={() => setPickup(true)}>
            Have a pickup code?
          </button>
        </header>

        <section aria-labelledby="kiosk-ask" className="rounded-[2rem] bg-pickle p-5 text-white lg:p-6">
          <h1 id="kiosk-ask" className="font-display text-4xl font-extrabold tracking-tight lg:text-5xl">
            What would you like?
          </h1>
          <p className="mt-1 text-lg text-white/80">
            {s.assistantDown
              ? "The ordering assistant is offline in this demo. Tap the menu below to order."
              : "Say it, type it, or tap the menu below."}
          </p>
          <div className="mt-4 text-char">
            <ChatInput
              size="kiosk"
              label="What would you like?"
              placeholder="Two cheeseburgers and a large fries…"
              disabled={!!s.thinking}
              stt={s.health?.speech.stt}
              onSpeechStart={voice.stop}
              onSend={s.send}
            >
              {canSpeak && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <VoiceRepliesToggle
                    size="kiosk"
                    enabled={voice.enabled}
                    onChange={voice.setEnabled}
                    label="Voice mode: read replies aloud"
                    hint="Accessibility: the assistant speaks its replies"
                  />
                  {voice.error && (
                    <p role="status" className="text-white">
                      {voice.error}
                    </p>
                  )}
                </div>
              )}
            </ChatInput>
          </div>
        </section>

        {s.notice && <Notice notice={s.notice} size="kiosk" onDismiss={s.dismissNotice} />}

        {(session.messages.length > 0 || s.thinking) && (
          <ChatThread
            size="kiosk"
            limit={2}
            messages={session.messages}
            thinking={s.thinking}
            pendingChoice={session.pendingChoice}
            currency={session.cart.currency}
            onChoose={(name) => void s.send(name)}
            welcome={null}
          />
        )}

        <TapMenu menu={s.menu} size="kiosk" disabled={s.busy} onPick={(item) => setDialog({ mode: "add", item })} />
      </main>

      <aside
        aria-label="Your order and payment"
        className="flex w-full flex-col gap-4 border-line bg-card/60 px-6 py-5 lg:w-[440px] lg:shrink-0 lg:overflow-y-auto lg:border-l"
      >
        <CartPanel
          size="kiosk"
          cart={session.cart}
          menu={s.menu}
          busy={s.busy}
          onQty={(lineId, qty) => void s.setQty(lineId, qty)}
          onRemove={(lineId) => void s.removeLine(lineId)}
          onEdit={(line) => setDialog({ mode: "edit", line })}
          empty="Tap an item or tell us what you'd like."
        />
        {session.cart.lines.length > 0 && (
          <QuestionsPanel
            size="kiosk"
            questions={session.questions}
            answers={session.answers}
            missing={session.missingAnswers}
            busy={s.busy}
            onAnswer={s.answer}
          />
        )}
        <div className="mt-auto">
          <CheckoutActions
            size="kiosk"
            session={session}
            busy={s.busy}
            onCheckout={(payment) => void s.checkout(payment)}
            actions={[{ payment: "kiosk", label: "Pay here (demo)", variant: "primary" }]}
          />
        </div>
      </aside>

      <LineDialog
        target={dialog}
        menu={s.menu}
        busy={s.busy}
        size="kiosk"
        onClose={() => setDialog(null)}
        onAdd={(itemId, modifiers, qty) => s.addItem(itemId, modifiers, qty)}
        onEdit={(lineId, modifiers) => s.updateOptions(lineId, modifiers)}
      />
      {pickup && <PickupCodeDialog onClose={() => setPickup(false)} />}
    </div>
  );
}
