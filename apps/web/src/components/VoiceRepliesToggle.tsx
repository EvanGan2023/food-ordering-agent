import type { Size } from "./ui";

interface Props {
  enabled: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
  size?: Size;
}

function SpeakerIcon({ on, className }: { on: boolean; className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

/** Turns spoken replies on or off. Only rendered when the server can speak. */
export function VoiceRepliesToggle({ enabled, onChange, label, hint, size = "regular" }: Props) {
  const kiosk = size === "kiosk";
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
      title={hint}
      className={`inline-flex items-center gap-2 rounded-full border-2 font-bold transition-colors ${
        kiosk ? "min-h-14 px-5 text-lg" : "min-h-11 px-4 text-sm"
      } ${enabled ? "border-pickle bg-lettuce text-pickle" : "border-char/15 bg-card text-char-soft hover:text-char"}`}
    >
      <SpeakerIcon on={enabled} className={kiosk ? "h-6 w-6" : "h-5 w-5"} />
      {label}
    </button>
  );
}
