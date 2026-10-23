"use client";

import { useEffect, useRef } from "react";
import { formatPrice, type ChatMessage, type ChoicePrompt } from "@foa/core";
import type { Size } from "./ui";

interface Props {
  messages: ChatMessage[];
  /** Text of a message that's on its way to the agent. */
  thinking: string | null;
  pendingChoice: ChoicePrompt | null;
  currency: string;
  onChoose: (optionName: string) => void;
  welcome: React.ReactNode;
  size?: Size;
  /** Only show the last few messages, e.g. on the kiosk home screen. */
  limit?: number;
}

export function ChatThread({ messages, thinking, pendingChoice, currency, onChoose, welcome, size = "regular", limit }: Props) {
  const end = useRef<HTMLDivElement>(null);
  const kiosk = size === "kiosk";
  const shown = limit ? messages.slice(-limit) : messages;
  const lastAssistant = shown.findLastIndex((m) => m.role === "assistant");

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, thinking, pendingChoice]);

  return (
    <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-3">
      {messages.length === 0 && !thinking && (
        <div className={`max-w-[85%] rounded-3xl rounded-bl-md bg-card px-4 py-3 ${kiosk ? "text-xl" : ""}`}>{welcome}</div>
      )}
      {shown.map((message, index) => (
        <div key={`${message.at}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start"}>
          <p
            className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 ${kiosk ? "text-xl" : ""} ${
              message.role === "user" ? "rounded-br-md bg-pickle text-white" : "rounded-bl-md bg-card"
            }`}
          >
            <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
            {message.text}
          </p>
          {index === lastAssistant && pendingChoice && !thinking && (
            <div className="mt-2 flex max-w-full flex-wrap gap-2" role="group" aria-label={`Choose ${pendingChoice.groupName}`}>
              {pendingChoice.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChoose(option.name)}
                  className={`rounded-full border-2 border-pickle bg-lettuce font-bold text-pickle transition-colors hover:bg-pickle hover:text-white ${
                    kiosk ? "min-h-14 px-6 text-lg" : "min-h-11 px-4"
                  }`}
                >
                  {option.name}
                  {option.priceDelta > 0 && <span className="ml-1 font-normal">+{formatPrice(option.priceDelta, currency)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {thinking && (
        <>
          <div className="flex justify-end">
            <p className={`max-w-[85%] rounded-3xl rounded-br-md bg-pickle/80 px-4 py-3 text-white ${kiosk ? "text-xl" : ""}`}>
              {thinking}
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2" role="status" aria-label="Assistant is typing">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-2.5 w-2.5 animate-bounce rounded-full bg-char-soft/60 motion-reduce:animate-none"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </>
      )}
      <div ref={end} />
    </div>
  );
}
