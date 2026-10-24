"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Channel, OrderQuestion, Settings } from "@foa/core";
import { Brand, buttonClass, Spinner } from "@/components/ui";
import { api, describeError } from "@/lib/api";

const TYPES: { value: OrderQuestion["type"]; label: string }[] = [
  { value: "choice", label: "Choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "time", label: "Time" },
];
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "online", label: "Online link" },
  { value: "kiosk", label: "Kiosk" },
  { value: "voice", label: "Phone" },
];

function problemsWith(q: OrderQuestion): string | null {
  if (!q.text.trim()) return "Add the question text.";
  if (q.type === "choice" && q.options.length < 2) return "A choice question needs at least two options.";
  if (q.channels.length === 0) return "Pick at least one channel.";
  return null;
}

export function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.settings().then(setSettings, (err) => setLoadError(describeError(err)));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loadError) return <Page><p role="alert" className="text-lg">{loadError}</p></Page>;
  if (!settings) return <Page><Spinner label="Loading settings…" /></Page>;

  const questions = settings.questions;
  const setQuestions = (next: OrderQuestion[]) => setSettings({ ...settings, questions: next });
  const update = (id: string, patch: Partial<OrderQuestion>) =>
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (index: number, by: number) => {
    const next = [...questions];
    const [q] = next.splice(index, 1);
    if (!q) return;
    next.splice(index + by, 0, q);
    setQuestions(next);
  };

  async function save() {
    if (!settings) return;
    const bad = settings.questions.find((q) => problemsWith(q));
    if (!settings.restaurantName.trim()) return setToast({ kind: "error", text: "Add the restaurant name." });
    if (bad) {
      setEditing(bad.id);
      return setToast({ kind: "error", text: `Fix this question before saving: ${problemsWith(bad)}` });
    }
    setSaving(true);
    try {
      setSettings(await api.saveSettings(settings));
      setEditing(null);
      setToast({ kind: "ok", text: "Settings saved." });
    } catch (err) {
      setToast({ kind: "error", text: `Couldn't save: ${describeError(err)}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <div className="space-y-6">
        <section className="rounded-3xl border-2 border-line bg-card p-5">
          <h2 className="font-display text-xl font-extrabold">Restaurant</h2>
          <label className="mt-4 block">
            <span className="font-bold">Restaurant name</span>
            <input
              value={settings.restaurantName}
              onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border-2 border-line px-3 outline-none focus:border-pickle"
            />
          </label>
          <div className="mt-4 space-y-3">
            <Toggle
              label="AI ordering assistant"
              hint="When off, customers order by tapping the menu."
              checked={settings.agentEnabled}
              onChange={(agentEnabled) => setSettings({ ...settings, agentEnabled })}
            />
            <Toggle
              label="Suggest add-ons"
              hint="The assistant may offer one relevant extra, like a drink with a burger."
              checked={settings.upsellEnabled}
              onChange={(upsellEnabled) => setSettings({ ...settings, upsellEnabled })}
            />
          </div>
        </section>

        <section className="rounded-3xl border-2 border-line bg-card p-5" aria-labelledby="questions-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="questions-title" className="font-display text-xl font-extrabold">
                Order questions
              </h2>
              <p className="text-char-soft">Asked on every order, by the assistant or on screen.</p>
            </div>
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={() => {
                const id = `q-${Date.now().toString(36)}`;
                setQuestions([
                  ...questions,
                  { id, text: "", type: "text", options: [], required: false, channels: ["online", "kiosk"], when: "before_checkout", sendToKitchen: true },
                ]);
                setEditing(id);
              }}
            >
              Add question
            </button>
          </div>

          <ol className="mt-4 space-y-3">
            {questions.map((q, index) => (
              <li key={q.id} className="rounded-2xl border-2 border-line">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{q.text || <span className="text-char-soft">New question</span>}</p>
                    <p className="text-sm text-char-soft">
                      {TYPES.find((t) => t.value === q.type)?.label}
                      {q.required ? ", required" : ", optional"}
                      {`, ${q.when === "start" ? "asked first" : "before checkout"}`}
                      {`, ${q.channels.map((c) => CHANNELS.find((x) => x.value === c)?.label).join(" + ")}`}
                    </p>
                  </div>
                  <button type="button" className={`${buttonClass("ghost")} px-3!`} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move "${q.text}" up`}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass("ghost")} px-3!`}
                    disabled={index === questions.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move "${q.text}" down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={buttonClass("secondary")}
                    aria-expanded={editing === q.id}
                    onClick={() => setEditing(editing === q.id ? null : q.id)}
                  >
                    {editing === q.id ? "Done" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass("danger")} px-3!`}
                    onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}
                    aria-label={`Delete "${q.text}"`}
                  >
                    Delete
                  </button>
                </div>
                {editing === q.id && <QuestionEditor question={q} onChange={(patch) => update(q.id, patch)} />}
              </li>
            ))}
          </ol>
          {questions.length === 0 && <p className="mt-4 text-char-soft">No questions. Add one to collect details like a name.</p>}
        </section>

        <div className="sticky bottom-4 flex justify-end">
          <button type="button" className={`${buttonClass("primary")} shadow-lg`} onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>

        <EmbedBox />
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 flex justify-center px-4">
        {toast && (
          <p
            role={toast.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-full px-5 py-3 font-bold shadow-xl ${toast.kind === "ok" ? "bg-pickle text-white" : "bg-alert text-white"}`}
          >
            {toast.text}
          </p>
        )}
      </div>
    </Page>
  );
}

function QuestionEditor({ question: q, onChange }: { question: OrderQuestion; onChange: (patch: Partial<OrderQuestion>) => void }) {
  const id = useId();
  const [optionsText, setOptionsText] = useState(q.options.join(", "));
  const problem = problemsWith(q);
  const field = "mt-1 h-11 w-full rounded-xl border-2 border-line bg-card px-3 outline-none focus:border-pickle";

  return (
    <div className="grid gap-4 border-t-2 border-line bg-paper p-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="font-bold">Question</span>
        <input value={q.text} onChange={(e) => onChange({ text: e.target.value })} className={field} placeholder="e.g. Dine in or takeaway?" />
      </label>
      <label>
        <span className="font-bold">Answer type</span>
        <select value={q.type} onChange={(e) => onChange({ type: e.target.value as OrderQuestion["type"] })} className={field}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="font-bold">When to ask</span>
        <select value={q.when} onChange={(e) => onChange({ when: e.target.value as OrderQuestion["when"] })} className={field}>
          <option value="start">At the start</option>
          <option value="before_checkout">Before checkout</option>
        </select>
      </label>
      {q.type === "choice" && (
        <label className="sm:col-span-2">
          <span className="font-bold">Options</span>
          <span className="ml-2 text-sm text-char-soft">Separate with commas</span>
          <input
            value={optionsText}
            onChange={(e) => {
              setOptionsText(e.target.value);
              onChange({ options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) });
            }}
            className={field}
            placeholder="Dine in, Takeaway"
          />
          {q.options.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
              {q.options.map((o) => (
                <span key={o} className="rounded-full bg-lettuce px-3 py-1 text-sm font-bold text-pickle">
                  {o}
                </span>
              ))}
            </span>
          )}
        </label>
      )}
      <fieldset className="sm:col-span-2">
        <legend className="font-bold">Ask on</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-pickle"
                checked={q.channels.includes(c.value)}
                onChange={(e) =>
                  onChange({ channels: e.target.checked ? [...q.channels, c.value] : q.channels.filter((x) => x !== c.value) })
                }
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="h-5 w-5 accent-pickle" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
        Required before checkout
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="h-5 w-5 accent-pickle"
          checked={q.sendToKitchen}
          onChange={(e) => onChange({ sendToKitchen: e.target.checked })}
        />
        Show the answer to the kitchen
      </label>
      {problem && (
        <p id={`${id}-problem`} className="text-sm font-bold text-alert sm:col-span-2">
          {problem}
        </p>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-bold">{label}</span>
        <span className="text-sm text-char-soft">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-8 w-14 shrink-0 rounded-full bg-char/20 transition-colors peer-checked:bg-pickle peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pickle after:absolute after:top-1 after:left-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-6"
      />
    </label>
  );
}

function EmbedBox() {
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const snippet = `<script src="${origin}/embed.js" data-restaurant="demo"></script>`;

  return (
    <section className="rounded-3xl border-2 border-line bg-card p-5" aria-labelledby="embed-title">
      <h2 id="embed-title" className="font-display text-xl font-extrabold">
        Embed on your website
      </h2>
      <p className="text-char-soft">Paste this before the closing &lt;/body&gt; tag. It adds an &ldquo;Order online&rdquo; button.</p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-char p-4 text-sm text-white">
        <code>{snippet}</code>
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() =>
            navigator.clipboard.writeText(snippet).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              () => setCopied(false),
            )
          }
        >
          {copied ? "Copied" : "Copy snippet"}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Snippet copied" : ""}
        </span>
        <Link href="/embed-demo" className="font-bold text-pickle underline underline-offset-4">
          See it on a sample website
        </Link>
      </div>
    </section>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Brand />
          <span className="text-sm text-char-soft">Owner settings</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Settings</h1>
        {children}
      </main>
    </div>
  );
}
