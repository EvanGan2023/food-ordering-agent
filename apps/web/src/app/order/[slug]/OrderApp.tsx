"use client";

import { useEffect, useState } from "react";
import { CartPanel } from "@/components/CartPanel";
import { ChatInput } from "@/components/ChatInput";
import { ChatThread } from "@/components/ChatThread";
import { CheckoutActions } from "@/components/CheckoutActions";
import { LineDialog, type DialogTarget } from "@/components/LineDialog";
import { Notice } from "@/components/Notice";
import { OrderConfirmation } from "@/components/OrderConfirmation";
import { QuestionsPanel } from "@/components/QuestionsPanel";
import { TapMenu } from "@/components/TapMenu";
import { VoiceRepliesToggle } from "@/components/VoiceRepliesToggle";
import { Brand, buttonClass, Spinner } from "@/components/ui";
import { useSpokenReplies, useVoiceReplies } from "@/lib/speech";
import { useOrderSession } from "@/lib/use-order-session";

type View = "chat" | "menu" | "order";

export function OrderApp({ slug, embed }: { slug: string; embed: boolean }) {
  const s = useOrderSession("online", `foa:session:online:${slug}`);
  const [view, setView] = useState<View>("chat");
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const voice = useVoiceReplies("foa:voice-replies:online");
  const canSpeak = !!s.health?.speech.tts;
  useSpokenReplies(s.lastReply, voice, canSpeak);
  const session = s.session;

  // With the assistant offline, start customers on the tap menu instead of an empty chat.
  useEffect(() => {
    if (s.assistantDown && session && session.messages.length === 0) setView((v) => (v === "chat" ? "menu" : v));
  }, [s.assistantDown, session]);

  if (s.loadError) {
    return (
      <Shell embed={embed}>
        <div className="m-auto max-w-sm p-6 text-center" role="alert">
          <p className="text-lg">{s.loadError}</p>
          <button type="button" className={`${buttonClass("primary")} mt-4`} onClick={() => void s.reload()}>
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  if (!session || !s.menu) {
    return (
      <Shell embed={embed}>
        <div className="m-auto">
          <Spinner label="Loading the menu…" />
        </div>
      </Shell>
    );
  }

  if (s.order) {
    return (
      <Shell embed={embed}>
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <OrderConfirmation order={s.order}>
            <p className="max-w-xs text-center text-char-soft">
              We&apos;ll call number {s.order.number} when it&apos;s ready.
            </p>
            <button type="button" className={buttonClass("secondary")} onClick={() => void s.reset()}>
              Start a new order
            </button>
          </OrderConfirmation>
        </div>
      </Shell>
    );
  }

  const count = session.cart.lines.reduce((n, l) => n + l.qty, 0);
  const tabs: { id: View; label: string; desktop: boolean }[] = [
    { id: "chat", label: "Chat", desktop: true },
    { id: "menu", label: "Menu", desktop: true },
    { id: "order", label: count ? `Order (${count})` : "Order", desktop: false },
  ];
  const left: View = view === "order" ? "chat" : view;

  return (
    <Shell embed={embed}>
      <nav aria-label="Ordering views" className="flex gap-1 border-b border-line bg-paper px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={view === t.id}
            onClick={() => setView(t.id)}
            className={`min-h-11 flex-1 rounded-full px-4 font-bold transition-colors lg:flex-none ${t.desktop ? "" : "lg:hidden"} ${
              view === t.id
                ? "bg-char text-white"
                : "text-char-soft hover:bg-char/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        <main
          className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 ${view === "order" ? "hidden lg:block" : ""}`}
          aria-label={left === "chat" ? "Chat with the ordering assistant" : "Menu"}
        >
          <div className="mx-auto max-w-2xl space-y-4">
            {s.notice && (
              <Notice notice={s.notice} onDismiss={s.dismissNotice} onBrowse={left === "menu" ? undefined : () => setView("menu")} />
            )}
            {left === "chat" ? (
              <ChatThread
                messages={session.messages}
                thinking={s.thinking}
                pendingChoice={session.pendingChoice}
                currency={session.cart.currency}
                onChoose={(name) => void s.send(name)}
                welcome={
                  s.assistantDown ? (
                    <>
                      The ordering assistant is offline in this demo, so tap{" "}
                      <button type="button" className="font-bold text-pickle underline" onClick={() => setView("menu")}>
                        Menu
                      </button>{" "}
                      to order.
                    </>
                  ) : (
                    <>Hi! What can we get you? Type or tap the mic, e.g. &ldquo;a cheeseburger meal with a Cola Zero&rdquo;.</>
                  )
                }
              />
            ) : (
              <TapMenu menu={s.menu} disabled={s.busy} onPick={(item) => setDialog({ mode: "add", item })} />
            )}
          </div>
        </main>

        <aside
          aria-label="Your order and checkout"
          className={`min-h-0 w-full overflow-y-auto border-line bg-paper px-4 py-4 lg:block lg:w-[420px] lg:shrink-0 lg:border-l ${
            view === "order" ? "block" : "hidden"
          }`}
        >
          <div className="mx-auto max-w-md space-y-4">
            {view === "order" && (
              // On phones the chat is hidden here, so keep the latest exchange in view.
              <div className="space-y-3 lg:hidden">
                {s.notice && <Notice notice={s.notice} onDismiss={s.dismissNotice} onBrowse={() => setView("menu")} />}
                {(s.thinking || session.messages.length > 0) && (
                  <ChatThread
                    messages={session.messages}
                    limit={1}
                    thinking={s.thinking}
                    pendingChoice={session.pendingChoice}
                    currency={session.cart.currency}
                    onChoose={(name) => void s.send(name)}
                    welcome={null}
                  />
                )}
              </div>
            )}
            <CartPanel
              cart={session.cart}
              menu={s.menu}
              busy={s.busy}
              onQty={(lineId, qty) => void s.setQty(lineId, qty)}
              onRemove={(lineId) => void s.removeLine(lineId)}
              onEdit={(line) => setDialog({ mode: "edit", line })}
              empty={
                <>
                  Nothing here yet. Tell us what you&apos;d like below, or{" "}
                  <button type="button" className="font-bold text-pickle underline" onClick={() => setView("menu")}>
                    browse the menu
                  </button>
                  .
                </>
              }
            />
            <QuestionsPanel
              questions={session.questions}
              answers={session.answers}
              missing={session.missingAnswers}
              busy={s.busy}
              onAnswer={s.answer}
            />
            <CheckoutActions
              session={session}
              busy={s.busy}
              onCheckout={(payment) => void s.checkout(payment)}
              actions={[
                { payment: "online", label: "Pay now (demo)", variant: "primary" },
                { payment: "at_pickup", label: "Pay at pickup", variant: "secondary" },
              ]}
            />
          </div>
        </aside>
      </div>

      <div className="border-t border-line bg-paper px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl lg:mr-[420px] lg:max-w-none lg:pr-4">
          <ChatInput
            label="Tell us what you'd like"
            placeholder={view === "order" ? "Tell us what to change…" : "Type your order…"}
            disabled={!!s.thinking}
            stt={s.health?.speech.stt}
            onSpeechStart={voice.stop}
            onSend={async (text) => {
              if (view === "menu") setView("chat");
              return s.send(text);
            }}
          >
            {canSpeak && (
              <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
                <VoiceRepliesToggle
                  enabled={voice.enabled}
                  onChange={voice.setEnabled}
                  label="Voice replies"
                  hint="Read the assistant's replies aloud"
                />
                {voice.error && (
                  <p role="status" className="text-sm text-char-soft">
                    {voice.error}
                  </p>
                )}
              </div>
            )}
          </ChatInput>
        </div>
      </div>

      <LineDialog
        target={dialog}
        menu={s.menu}
        busy={s.busy}
        onClose={() => setDialog(null)}
        onAdd={(itemId, modifiers, qty) => s.addItem(itemId, modifiers, qty)}
        onEdit={(lineId, modifiers) => s.updateOptions(lineId, modifiers)}
      />
    </Shell>
  );
}

function Shell({ embed, children }: { embed: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className={`flex items-center justify-between gap-3 border-b border-line bg-card px-4 ${embed ? "py-2 pr-14" : "py-3"}`}>
        <Brand href={embed ? null : "/"} />
        {!embed && <span className="hidden text-sm text-char-soft sm:block">Online ordering</span>}
      </header>
      {children}
    </div>
  );
}
