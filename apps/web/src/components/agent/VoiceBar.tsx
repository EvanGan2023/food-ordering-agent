"use client";

import { useId, useState } from "react";
import type { AgentInput } from "@/lib/use-agent-input";
import type { Size } from "../ui";

interface Props {
  input: AgentInput;
  size?: Size;
  /** Starts in text mode instead of talk mode (the kiosk starts in talk mode). */
  typingFirst?: boolean;
  disabled?: boolean;
  /** Shown only when the server can speak. */
  voice?: { enabled: boolean; setEnabled: (on: boolean) => void } | null;
  placeholder?: string;
}

function MicIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function KeyboardIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

function SpeakerIcon({ on, className }: { on: boolean; className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

/** The floating talk/type bar under the orb. */
export function VoiceBar({ input, size = "regular", typingFirst, disabled, voice, placeholder = "Type your order…" }: Props) {
  const kiosk = size === "kiosk";
  const { speech } = input;
  const micAvailable = speech.supported !== false;
  const [typing, setTyping] = useState(!!typingFirst || !micAvailable);
  const [value, setValue] = useState("");
  const inputId = useId();
  const showInput = typing || !micAvailable;

  const round = kiosk ? "size-19" : "size-12";
  const icon = kiosk ? "size-8" : "size-5.5";
  const side = `grid shrink-0 place-items-center rounded-full bg-char/6 text-char transition-colors hover:bg-char/12 disabled:opacity-40 ${round}`;

  const listening = speech.listening;
  const micLabel = speech.transcribing ? "One moment…" : listening ? "Tap when done" : "Tap to talk";

  async function submit() {
    const text = value.trim();
    if (!text) return;
    setValue("");
    if (!(await input.send(text))) setValue(text);
  }

  const mic = (wide: boolean) => (
    <button
      type="button"
      onClick={input.toggleMic}
      disabled={disabled || speech.transcribing}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening and send" : "Talk to order"}
      className={`flex shrink-0 items-center justify-center gap-3 rounded-full font-semibold transition-colors disabled:opacity-45 ${
        listening ? "bg-pickle text-white" : "bg-bun text-char hover:bg-[#d9944a]"
      } ${wide ? (kiosk ? "h-22 min-w-80 px-10 text-2xl" : "h-14 px-7 text-lg") : round}`}
    >
      <MicIcon className={icon} />
      {wide && micLabel}
    </button>
  );

  return (
    <div className={`flex justify-center ${kiosk ? "px-8 pb-8" : "px-4 pb-4"}`}>
      <div
        className={`flex w-full items-center rounded-full border border-line bg-card shadow-[0_4px_16px_rgb(43_33_28/0.07)] ${
          kiosk ? "max-w-3xl gap-3.5 p-3.5" : "max-w-2xl gap-2 p-2"
        } ${showInput ? "" : "w-auto!"}`}
      >
        {showInput ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Tell us what you&apos;d like
            </label>
            <input
              id={inputId}
              value={listening ? "" : value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={listening ? "Listening…" : placeholder}
              autoComplete="off"
              enterKeyHint="send"
              disabled={disabled}
              className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-char-soft ${kiosk ? "h-19 px-6 text-2xl" : "h-12 px-4 text-base"}`}
            />
            {value.trim() && (
              <button
                type="submit"
                disabled={disabled}
                className={`shrink-0 rounded-full bg-char font-semibold text-paper disabled:opacity-45 ${kiosk ? "h-19 px-8 text-xl" : "h-12 px-5"}`}
              >
                Send
              </button>
            )}
            {micAvailable && !value.trim() && (kiosk && !listening ? (
              <button type="button" className={side} onClick={() => setTyping(false)} aria-label="Talk instead">
                <MicIcon className={icon} />
              </button>
            ) : (
              mic(false)
            ))}
          </form>
        ) : (
          <>
            <button type="button" className={side} onClick={() => setTyping(true)} aria-label="Type instead">
              <KeyboardIcon className={icon} />
            </button>
            {mic(true)}
          </>
        )}
        {voice && (
          <button
            type="button"
            className={side}
            aria-pressed={voice.enabled}
            aria-label={voice.enabled ? "Mute spoken replies" : "Read replies aloud"}
            title={voice.enabled ? "Spoken replies on" : "Spoken replies off"}
            onClick={() => voice.setEnabled(!voice.enabled)}
          >
            <SpeakerIcon on={voice.enabled} className={icon} />
          </button>
        )}
      </div>
    </div>
  );
}
