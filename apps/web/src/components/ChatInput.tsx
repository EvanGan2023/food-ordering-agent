"use client";

import { useId, useState } from "react";
import { useSpeechInput } from "@/lib/speech";
import { buttonClass, type Size } from "./ui";

interface Props {
  /** Resolves false if the message didn't go through, so the text is put back. */
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  size?: Size;
  label?: string;
  placeholder?: string;
  /** Speech-to-text provider from GET /health; browser recognition is used when it isn't "elevenlabs". */
  stt?: string;
  /** Called when the customer starts talking, e.g. to stop a spoken reply. */
  onSpeechStart?: () => void;
  /** Extra controls shown under the input, such as the voice replies toggle. */
  children?: React.ReactNode;
}

function MicIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function ChatInput({
  onSend,
  disabled,
  size = "regular",
  label = "Message",
  placeholder = "Type your order…",
  stt,
  onSpeechStart,
  children,
}: Props) {
  const [value, setValue] = useState("");
  const [interim, setInterim] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const kiosk = size === "kiosk";

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setValue("");
    if (!(await onSend(trimmed))) setValue(trimmed);
  }

  const speech = useSpeechInput({
    stt,
    onStart: onSpeechStart,
    onInterim: (text) => setInterim(text),
    onFinal: (text) => {
      setInterim(null);
      setValue(text);
      void send(text);
    },
  });

  const capturing = speech.listening || speech.transcribing;
  const shown = speech.listening && speech.interimShown ? (interim ?? "") : capturing ? "" : value;
  const status = speech.transcribing ? "Transcribing…" : speech.listening ? "Listening… tap the mic to stop" : null;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(value);
        }}
        className={`flex items-center gap-2 rounded-full border-2 bg-card p-1.5 transition-colors focus-within:border-pickle ${
          speech.listening ? "border-bun" : "border-char/15"
        }`}
      >
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          value={shown}
          onChange={(e) => setValue(e.target.value)}
          readOnly={capturing}
          placeholder={status ?? placeholder}
          autoComplete="off"
          enterKeyHint="send"
          aria-describedby={speech.error || speech.supported === false ? hintId : undefined}
          className={`min-w-0 flex-1 bg-transparent px-4 outline-none placeholder:text-char-soft/70 ${
            kiosk ? "h-16 text-2xl" : "h-11 text-base"
          }`}
        />
        {speech.supported && (
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={speech.transcribing || (disabled && !speech.listening)}
            aria-pressed={speech.listening}
            aria-label={speech.transcribing ? "Transcribing" : speech.listening ? "Stop and send" : "Talk to order"}
            className={`relative grid shrink-0 place-items-center rounded-full transition-colors disabled:opacity-45 ${
              kiosk ? "h-16 w-16" : "h-11 w-11"
            } ${speech.listening ? "bg-bun text-char" : "bg-bun-soft text-char hover:bg-bun"}`}
          >
            {speech.listening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-bun/60 motion-reduce:hidden" aria-hidden="true" />
            )}
            {speech.transcribing ? (
              <span className="relative h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
            ) : speech.listening ? (
              <span className={`relative rounded-sm bg-current ${kiosk ? "h-6 w-6" : "h-4 w-4"}`} aria-hidden="true" />
            ) : (
              <MicIcon className={`relative ${kiosk ? "h-8 w-8" : "h-5 w-5"}`} />
            )}
          </button>
        )}
        {speech.supported === false && (
          <span
            className="grid h-8 w-8 shrink-0 cursor-help place-items-center rounded-full text-sm text-char-soft"
            title="Voice input isn't supported in this browser. Try Chrome or Safari."
            aria-hidden="true"
          >
            <MicIcon className="h-4 w-4 opacity-40" />
          </span>
        )}
        <button
          type="submit"
          disabled={disabled || !value.trim() || capturing}
          className={`${buttonClass("primary", size)} shrink-0`}
        >
          Send
        </button>
      </form>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {children}
      {(speech.error || speech.supported === false) && (
        <p id={hintId} className={`mt-1 px-4 text-sm ${speech.error ? "text-alert" : "sr-only"}`}>
          {speech.error ?? "Voice input isn't supported in this browser."}
        </p>
      )}
    </div>
  );
}
