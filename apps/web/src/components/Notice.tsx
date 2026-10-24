import type { Notice as NoticeData } from "@/lib/use-order-session";
import { buttonClass, type Size } from "./ui";

interface Props {
  notice: NoticeData;
  size?: Size;
  onBrowse?: () => void;
  onDismiss: () => void;
}

export function Notice({ notice, size = "regular", onBrowse, onDismiss }: Props) {
  const offline = notice.kind === "offline";
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
        offline ? "border-bun bg-bun-soft" : "border-alert/30 bg-alert-soft"
      }`}
    >
      <p className={`min-w-0 flex-1 ${size === "kiosk" ? "text-lg" : ""}`}>{notice.text}</p>
      {offline && onBrowse && (
        <button type="button" className={buttonClass("primary", size)} onClick={onBrowse}>
          Browse menu
        </button>
      )}
      <button type="button" className={`${buttonClass("ghost", size)} px-3!`} onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
