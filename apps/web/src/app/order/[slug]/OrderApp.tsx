"use client";

import { useState } from "react";
import { formatPrice, type PricedLine } from "@foa/core";
import { AgentStage } from "@/components/agent/AgentStage";
import { OrderCard } from "@/components/agent/OrderCard";
import { VoiceBar } from "@/components/agent/VoiceBar";
import { LineDialog } from "@/components/LineDialog";
import { OrderConfirmation } from "@/components/OrderConfirmation";
import { Brand, buttonClass, restaurantName, Spinner } from "@/components/ui";
import { useSpokenReplies, useVoiceReplies } from "@/lib/speech";
import { useAgentInput } from "@/lib/use-agent-input";
import { useOrderSession } from "@/lib/use-order-session";

/**
 * The ordering link restaurants put on their own site (directly or via embed.js).
 * Agent-only: the restaurant's site shows its menu; customers say or type the order here.
 */
export function OrderApp({ slug, embed }: { slug: string; embed: boolean }) {
  const s = useOrderSession("online", `foa:session:online:${slug}`);
  const [editing, setEditing] = useState<PricedLine | null>(null);
  // Phones: the order slides up over the agent when opened.
  const [orderOpen, setOrderOpen] = useState(false);
  const voice = useVoiceReplies("foa:voice-replies:online");
  const canSpeak = !!s.health?.speech.tts;
  useSpokenReplies(s.reply, voice, canSpeak);
  const input = useAgentInput(s, voice);
  const session = s.session;

  if (s.loadError) {
    return (
      <Shell embed={embed} name={restaurantName(s.menu?.name)}>
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
      <Shell embed={embed} name={restaurantName(s.menu?.name)}>
        <div className="m-auto">
          <Spinner label="Loading…" />
        </div>
      </Shell>
    );
  }

  if (s.order) {
    return (
      <Shell embed={embed} name={restaurantName(s.menu?.name)}>
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <OrderConfirmation order={s.order}>
            <p className="max-w-xs text-center text-char-soft">
              We&apos;ll call number {s.order.number} when it&apos;s ready.
            </p>
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={() => {
                setOrderOpen(false);
                void s.reset();
              }}
            >
              Start a new order
            </button>
          </OrderConfirmation>
        </div>
      </Shell>
    );
  }

  const { cart } = session;
  const count = cart.lines.reduce((n, l) => n + l.qty, 0);

  const card = (phone: boolean) => (
    <OrderCard
      session={session}
      menu={s.menu!}
      busy={s.busy}
      actions={[
        { payment: "online", label: "Pay now (demo)", primary: true },
        { payment: "at_pickup", label: "Pay at pickup" },
      ]}
      onQty={(lineId, qty) => void s.setQty(lineId, qty)}
      onRemove={(lineId) => void s.removeLine(lineId)}
      onEdit={setEditing}
      onAnswer={s.answer}
      onCheckout={(payment) => void s.checkout(payment)}
      onCollapse={phone ? () => setOrderOpen(false) : undefined}
      className={phone ? "mx-3 mb-3 min-h-0 flex-1" : "m-5 ml-0 w-[400px] shrink-0"}
    />
  );

  return (
    <Shell embed={embed} name={restaurantName(s.menu?.name)}>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* On a phone with the order open, keep only the caption so the order has room. */}
          <div className={`flex min-h-0 flex-col ${orderOpen ? "shrink-0 lg:flex-1" : "flex-1"}`}>
            <AgentStage
              session={session}
              input={input}
              notice={s.notice}
              hint={input.speech.error ?? voice.error}
              compact={orderOpen}
              onDismissNotice={s.dismissNotice}
            />
          </div>

          {orderOpen && <div className="flex min-h-0 flex-1 flex-col lg:hidden">{card(true)}</div>}

          {!orderOpen && count > 0 && (
            <div className="px-4 pb-3 lg:hidden">
              <button
                type="button"
                onClick={() => setOrderOpen(true)}
                className="line-in mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3.5 text-left shadow-[0_2px_10px_rgb(43_33_28/0.06)]"
              >
                <span className="font-semibold">
                  Your order · {count} item{count === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  {formatPrice(cart.subtotal + session.tax, cart.currency)}
                  <span className="text-sm font-medium text-pickle">View</span>
                </span>
              </button>
            </div>
          )}

          <div className="pb-[env(safe-area-inset-bottom)]">
            <VoiceBar
              input={input}
              typingFirst
              disabled={s.assistantDown}
              voice={canSpeak ? voice : null}
              placeholder={count > 0 ? "Add or change something…" : "Say or type your order…"}
            />
          </div>
        </div>

        <div className="hidden min-h-0 lg:flex">{card(false)}</div>
      </div>

      <LineDialog line={editing} menu={s.menu} busy={s.busy} onClose={() => setEditing(null)} onEdit={s.updateOptions} />
    </Shell>
  );
}

function Shell({ embed, name, children }: { embed: boolean; name: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className={`flex shrink-0 items-center justify-between gap-3 px-5 ${embed ? "py-3 pr-14" : "py-4"}`}>
        <Brand href={embed ? null : "/"} name={name || undefined} />
        {!embed && <span className="hidden text-sm text-char-soft sm:block">Order ahead</span>}
      </header>
      {children}
    </div>
  );
}
