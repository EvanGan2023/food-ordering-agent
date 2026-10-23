"use client";

import { useId, useState } from "react";
import type { Answers, OrderQuestion } from "@foa/core";
import { buttonClass, type Size } from "./ui";

interface Props {
  questions: OrderQuestion[];
  answers: Answers;
  missing: string[];
  busy?: boolean;
  size?: Size;
  onAnswer: (questionId: string, value: string) => Promise<string | null>;
}

export function QuestionsPanel({ questions, answers, missing, busy, size = "regular", onAnswer }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  if (questions.length === 0) return null;
  const open = questions.filter((q) => !answers[q.id] || editing === q.id);
  const done = questions.filter((q) => answers[q.id] && editing !== q.id);
  const kiosk = size === "kiosk";

  return (
    <section aria-labelledby="order-details" className="rounded-3xl border-2 border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="order-details" className={`font-display font-extrabold tracking-tight ${kiosk ? "text-2xl" : "text-xl"}`}>
          Order details
        </h2>
        <span className="text-sm text-char-soft" aria-live="polite">
          {missing.length === 0 ? "All set" : `${missing.length} needed`}
        </span>
      </div>

      {open.length > 0 && (
        <ul className="mt-3 space-y-4">
          {open.map((q) => (
            <li key={q.id}>
              <QuestionField
                question={q}
                current={answers[q.id]}
                needed={missing.includes(q.id)}
                busy={busy}
                size={size}
                onAnswer={async (value) => {
                  const error = await onAnswer(q.id, value);
                  if (!error) setEditing(null);
                  return error;
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <dl className="mt-3 divide-y divide-line">
          {done.map((q) => (
            <div key={q.id} className="flex items-center gap-3 py-2">
              <dt className="min-w-0 flex-1 text-sm text-char-soft">{q.text}</dt>
              <dd className="font-bold">{answers[q.id]}</dd>
              <button
                type="button"
                className={`${buttonClass("ghost", size)} min-h-10! px-3! text-sm!`}
                onClick={() => setEditing(q.id)}
                aria-label={`Change answer to: ${q.text}`}
              >
                Change
              </button>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

interface FieldProps {
  question: OrderQuestion;
  current: string | undefined;
  needed: boolean;
  busy?: boolean;
  size: Size;
  onAnswer: (value: string) => Promise<string | null>;
}

function QuestionField({ question, current, needed, busy, size, onAnswer }: FieldProps) {
  const [value, setValue] = useState(current && current !== "ASAP" ? current : "");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const kiosk = size === "kiosk";

  async function submit(answer: string) {
    if (!answer.trim()) return;
    setError(await onAnswer(answer));
  }

  const chip = (label: string, selected: boolean) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      aria-pressed={selected}
      onClick={() => void submit(label)}
      className={`rounded-full border-2 font-bold transition-colors disabled:opacity-50 ${kiosk ? "min-h-14 px-6 text-lg" : "min-h-11 px-4"} ${
        selected ? "border-pickle bg-pickle text-white" : "border-line bg-card hover:border-pickle"
      }`}
    >
      {label}
    </button>
  );

  const textLike = question.type === "text" || question.type === "number" || question.type === "time";

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={needed ? "-mx-2 rounded-2xl border-l-4 border-bun bg-bun-soft/60 px-3 py-2" : ""}
    >
      <p id={`${id}-label`} className={`font-bold ${kiosk ? "text-lg" : ""}`}>
        {question.text}
        {question.required ? (
          <span className="ml-2 text-sm font-bold text-pickle">Required</span>
        ) : (
          <span className="ml-2 text-sm font-normal text-char-soft">Optional</span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {question.type === "choice" && question.options.map((o) => chip(o, current === o))}
        {question.type === "yes_no" && ["Yes", "No"].map((o) => chip(o, current === o))}
        {question.type === "time" && chip("ASAP", current === "ASAP")}
        {textLike && (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(value);
            }}
          >
            <label htmlFor={`${id}-input`} className="sr-only">
              {question.text}
            </label>
            <input
              id={`${id}-input`}
              type={question.type === "time" ? "time" : question.type === "number" ? "number" : "text"}
              inputMode={question.type === "number" ? "decimal" : undefined}
              value={value}
              maxLength={question.type === "text" ? 200 : undefined}
              onChange={(e) => setValue(e.target.value)}
              className={`min-w-0 flex-1 rounded-full border-2 border-line bg-card px-4 outline-none focus:border-pickle ${
                kiosk ? "h-14 text-lg" : "h-11"
              }`}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            <button type="submit" className={buttonClass("secondary", size)} disabled={busy || !value.trim()}>
              {question.type === "time" ? "Set time" : "Save"}
            </button>
          </form>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-bold text-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
