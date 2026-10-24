"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeError, speakUrl } from "./api";
import type { LiveReply } from "./use-order-session";

// The Web Speech API isn't in every TypeScript DOM lib, so we describe the parts we use.
interface RecognitionResult {
  isFinal: boolean;
  /** Alternative transcripts, most likely first. */
  length: number;
  [index: number]: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface SpeechOptions {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Picks one of the recogniser's alternative transcripts, e.g. the one that best fits the menu. */
  choose?: (alternatives: string[]) => string;
}

/** A pause this long after the customer has spoken ends their turn. */
const SILENCE_MS = 1500;
/** Stop listening if nothing at all is heard for this long. */
const NO_SPEECH_MS = 8000;
/** How long to wait for the browser's final words after stopping before using what we have. */
const STOP_GRACE_MS = 1500;

/** How long the mic stays open after the last listen, so the next tap is heard at once. */
const WARM_MIC_MS = 2 * 60_000;

const NOTHING_HEARD = "Didn't hear anything. Tap the mic and try again, or type instead.";

/**
 * Keeps the microphone open between listens while someone is ordering. Opening it is what makes the
 * browser's recogniser slow to start (most of all with Bluetooth headsets), so words said right
 * after the tap were lost; with the mic already open it hears from the moment of the tap.
 * It closes after WARM_MIC_MS without a listen, or when the page is hidden.
 */
function useWarmMic() {
  const stream = useRef<MediaStream | null>(null);
  const opening = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wanted = useRef(false);

  const release = useCallback(() => {
    wanted.current = false;
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const keep = useCallback(() => {
    wanted.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(release, WARM_MIC_MS);
    if (stream.current?.active || opening.current || !navigator.mediaDevices?.getUserMedia) return;
    opening.current = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((opened) => {
        if (wanted.current) stream.current = opened;
        else opened.getTracks().forEach((track) => track.stop());
      })
      .catch(() => undefined) // blocked: the recogniser reports it
      .finally(() => {
        opening.current = false;
      });
  }, [release]);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) release();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      release();
    };
  }, [release]);

  return keep;
}

/**
 * Talk with the browser's own speech recognition. It keeps listening through short pauses, so a
 * whole order can be said in one go, and sends once the customer stops talking (or taps stop).
 * `supported` is null until checked on the client; `ready` turns true once the mic is really on.
 */
export function useBrowserSpeech({ onInterim, onFinal, choose }: SpeechOptions) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  /** Ends the current listen and sends what was heard. */
  const stopRef = useRef<() => void>(() => {});
  const handlers = useRef({ onInterim, onFinal, choose });
  handlers.current = { onInterim, onFinal, choose };
  const keepMicOpen = useWarmMic();

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    keepMicOpen();
    const rec = new Ctor();
    rec.lang = "en-AU";
    rec.interimResults = true;
    rec.continuous = true;
    // Several guesses per phrase, so a misheard one can lose to one that fits the menu.
    rec.maxAlternatives = 5;

    let finalText = "";
    let interimText = "";
    let delivered = false;
    let silence: ReturnType<typeof setTimeout> | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const heard = () => `${finalText} ${interimText}`.replace(/\s+/g, " ").trim();

    // Hands over everything heard, once, including words the browser hadn't finalised yet.
    const deliver = () => {
      if (delivered) return;
      delivered = true;
      clearTimeout(silence);
      clearTimeout(grace);
      if (recognition.current === rec) recognition.current = null;
      setListening(false);
      setReady(false);
      const text = heard();
      if (text) handlers.current.onFinal(text);
      else setError((current) => current ?? NOTHING_HEARD);
    };
    const finish = () => {
      clearTimeout(silence);
      rec.stop(); // the browser sends its last words, then onend delivers
      grace = setTimeout(() => {
        rec.abort();
        deliver();
      }, STOP_GRACE_MS);
    };
    stopRef.current = finish;

    rec.onaudiostart = () => setReady(true);
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) {
          const alternatives = Array.from({ length: result.length }, (_, k) => result[k]?.transcript ?? "").filter(Boolean);
          finalText += ` ${handlers.current.choose?.(alternatives) ?? alternatives[0] ?? ""}`;
        } else interim += result[0]?.transcript ?? "";
      }
      interimText = interim;
      const text = heard();
      if (text) handlers.current.onInterim(text);
      // Still talking: wait for a real pause before sending.
      clearTimeout(silence);
      silence = setTimeout(finish, SILENCE_MS);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow it in your browser settings, or type instead.");
      } else if (event.error === "audio-capture") {
        setError("No microphone found. Type your order instead.");
      } else if (event.error === "network") {
        setError("Speech recognition needs an internet connection in this browser. Type your order instead.");
      } else if (event.error === "no-speech") {
        setError(NOTHING_HEARD);
      }
    };
    rec.onend = deliver;

    setError(null);
    recognition.current = rec;
    rec.start();
    setListening(true);
    silence = setTimeout(() => {
      if (!heard()) finish();
    }, NO_SPEECH_MS);
  }, [keepMicOpen]);

  const stop = useCallback(() => {
    if (recognition.current) stopRef.current();
  }, []);

  return { supported, listening, ready, error, start, stop };
}

const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 20_000;
const FALLBACK_KEY = "foa:stt-fallback";

// Opus in WebM for Chrome and Firefox, MP4/AAC for Safari.
const RECORDING_TYPES = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "mp4" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

function canRecord() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function micError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it in your browser settings, or type instead.";
  }
  if (name === "NotFoundError") return "No microphone found. Type your order instead.";
  return "Couldn't start the microphone. Type your order instead.";
}

interface RecorderOptions {
  onFinal: (text: string) => void;
  /** Called when transcription fails, so the caller can switch to browser recognition. */
  onFailure: (message: string) => void;
}

/** Records a clip with MediaRecorder and transcribes it on the server. */
function useRecorder({ onFinal, onFailure }: RecorderOptions) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onFinal, onFailure });
  handlers.current = { onFinal, onFailure };

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(
    () => () => {
      // Unmounting mid-recording: drop the clip and release the mic.
      const rec = recorder.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        if (rec.state === "recording") rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const start = useCallback(async () => {
    if (recorder.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(micError(err));
      return;
    }

    const type = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime));
    const rec = new MediaRecorder(stream, type ? { mimeType: type.mime } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();

    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setListening(false);
      // A quick tap on the mic isn't speech.
      if (Date.now() - startedAt < MIN_RECORDING_MS || chunks.length === 0) return;

      const mime = rec.mimeType || type?.mime || "audio/webm";
      const ext = RECORDING_TYPES.find((t) => mime.startsWith(t.mime.split(";")[0]!))?.ext ?? "webm";
      setTranscribing(true);
      try {
        const { text } = await api.transcribe(new Blob(chunks, { type: mime }), `speech.${ext}`);
        if (text.trim()) handlers.current.onFinal(text.trim());
        else setError("Didn't catch that. Try again or type instead.");
      } catch (err) {
        handlers.current.onFailure(describeError(err));
      } finally {
        setTranscribing(false);
      }
    };

    recorder.current = rec;
    rec.start();
    setListening(true);
    timer.current = setTimeout(stop, MAX_RECORDING_MS);
  }, [stop]);

  return { listening, transcribing, error, start, stop };
}

interface SpeechInputOptions {
  /** From GET /health: "elevenlabs" records and transcribes on the server; anything else uses the browser. */
  stt: string | undefined;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Called as the customer starts talking, e.g. to stop a reply that's still playing. */
  onStart?: () => void;
  choose?: (alternatives: string[]) => string;
}

/** Push-to-talk input that uses server transcription when available and the browser's recognition otherwise. */
export function useSpeechInput({ stt, onInterim, onFinal, onStart, choose }: SpeechInputOptions) {
  const [fallback, setFallback] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [recordable, setRecordable] = useState(false);
  const browser = useBrowserSpeech({ onInterim, onFinal, choose });
  const recorder = useRecorder({
    onFinal,
    onFailure: (message) => {
      try {
        sessionStorage.setItem(FALLBACK_KEY, "1");
      } catch {
        // Storage blocked: the fallback still applies until the page reloads.
      }
      setFallback(true);
      setFallbackNote(`${message} Using your browser's speech recognition instead.`);
    },
  });

  useEffect(() => {
    setRecordable(canRecord());
    try {
      if (sessionStorage.getItem(FALLBACK_KEY)) setFallback(true);
    } catch {
      // Ignore blocked storage.
    }
  }, []);

  const server = stt === "elevenlabs" && recordable && !fallback;

  if (server) {
    return {
      supported: true as boolean | null,
      listening: recorder.listening,
      ready: recorder.listening,
      transcribing: recorder.transcribing,
      interimShown: false,
      error: recorder.error,
      start: () => {
        onStart?.();
        void recorder.start();
      },
      stop: recorder.stop,
    };
  }
  return {
    supported: browser.supported,
    listening: browser.listening,
    ready: browser.ready,
    transcribing: false,
    interimShown: true,
    error: browser.error ?? fallbackNote,
    start: () => {
      onStart?.();
      browser.start();
    },
    stop: browser.stop,
  };
}

/** Turns a streamed WAV's 16-bit PCM bytes into samples; returns any odd byte left for the next chunk. */
function pcm16(bytes: Uint8Array): { samples: Float32Array; rest: Uint8Array } {
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  const samples = new Float32Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 0x8000;
  return { samples, rest: bytes.slice(usable) };
}

function joinBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

const WAV_HEADER = 44;

/**
 * Reads the agent's replies aloud via the server's text-to-speech.
 * Audio plays through Web Audio as it arrives: an <audio> element waits for most of a streamed
 * clip before it starts, which left the voice seconds behind the text.
 * With a storage key the on/off choice lives in sessionStorage; without one (the kiosk) it
 * starts at `defaultOn` and the caller resets it for each customer.
 */
export function useVoiceReplies(storageKey: string | null, defaultOn = false) {
  const [enabled, setEnabledState] = useState(defaultOn);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null);
  /** Sentences play in the order they were queued; each one's audio is fetched as soon as it's queued. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  /** When the audio queued so far ends, in AudioContext time. */
  const playhead = useRef(0);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  /** Bumped by stop(), so audio still arriving for an old reply is dropped. */
  const generation = useRef(0);
  const pending = useRef(0);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) setEnabledState(saved === "1");
    } catch {
      // Ignore blocked storage.
    }
  }, [storageKey]);

  // Browsers only allow sound after the customer taps or types, so the audio is unlocked then.
  useEffect(() => {
    const unlock = () => {
      if (typeof AudioContext === "undefined") return;
      // Created on a tap so the browser allows sound later; it stays suspended until there's something to say.
      context.current ??= new AudioContext();
      if (context.current.state === "running" && sources.current.size === 0 && pending.current === 0) void context.current.suspend();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  // Let go of the speakers whenever nothing is playing: an open audio output can stop the mic
  // from hearing anything on some computers (e.g. Bluetooth headsets switching to call mode).
  const idle = useCallback(() => {
    if (context.current?.state === "running") void context.current.suspend();
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    pending.current = 0;
    chain.current = Promise.resolve();
    for (const source of sources.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    sources.current.clear();
    playhead.current = 0;
    setSpeaking(false);
    idle();
  }, [idle]);

  useEffect(() => stop, [stop]);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      if (on) setError(null);
      else stop();
      if (!storageKey) return;
      try {
        sessionStorage.setItem(storageKey, on ? "1" : "0");
      } catch {
        // Ignore blocked storage.
      }
    },
    [stop, storageKey],
  );

  /** Adds a sentence to what's being said, so a reply can be spoken while it's still being written. */
  const say = useCallback(
    (text: string) => {
      const ctx = context.current;
      // No tap yet, so the browser won't play sound: skip this reply but keep voice on for the next one.
      if (!text.trim() || !ctx || ctx.state === "closed") return;
      // Once the customer has tapped, the browser lets the page start sound again.
      if (ctx.state === "suspended") void ctx.resume();
      const gen = generation.current;
      const current = () => generation.current === gen;
      const response = fetch(speakUrl(text), { cache: "no-store" });
      pending.current++;

      const play = (samples: Float32Array, rate: number) => {
        if (!current() || !samples.length) return;
        const buffer = ctx.createBuffer(1, samples.length, rate);
        buffer.getChannelData(0).set(samples);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const at = Math.max(ctx.currentTime + 0.02, playhead.current);
        source.start(at);
        playhead.current = at + buffer.duration;
        sources.current.add(source);
        setSpeaking(true);
        source.onended = () => {
          sources.current.delete(source);
          if (current() && sources.current.size === 0 && pending.current === 0) {
            setSpeaking(false);
            idle();
          }
        };
      };

      const run = async () => {
        const res = await response;
        if (!res.ok || !res.body) throw new Error(`speech ${res.status}`);
        if (!current()) return void res.body.cancel();
        if (!(res.headers.get("content-type") ?? "").includes("wav")) {
          // Compressed audio (ElevenLabs MP3) can't be played in pieces; decode it whole.
          const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
          return play(decoded.getChannelData(0), decoded.sampleRate);
        }
        const reader = res.body.getReader();
        let head: Uint8Array = new Uint8Array(0);
        let rest: Uint8Array = new Uint8Array(0);
        let rate = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          if (!current()) return void reader.cancel();
          let bytes: Uint8Array = value;
          if (!rate) {
            head = joinBytes(head, bytes);
            if (head.length < WAV_HEADER) continue;
            rate = new DataView(head.buffer, head.byteOffset).getUint32(24, true);
            bytes = head.slice(WAV_HEADER);
          }
          const pcm = pcm16(joinBytes(rest, bytes));
          rest = pcm.rest;
          play(pcm.samples, rate);
        }
      };

      chain.current = chain.current
        .then(run)
        .catch((err: unknown) => {
          if (!current()) return;
          console.error("voice reply failed:", err);
          stop();
          setEnabled(false);
          setError("Voice replies stopped working, so they're turned off. Replies still show as text.");
        })
        .finally(() => {
          if (!current()) return;
          pending.current--;
          if (pending.current === 0 && sources.current.size === 0) {
            setSpeaking(false);
            idle();
          }
        });
    },
    [idle, setEnabled, stop],
  );

  const speak = useCallback(
    (text: string) => {
      stop();
      say(text);
    },
    [say, stop],
  );

  return { enabled, setEnabled, speaking, speak, say, stop, error, dismissError: () => setError(null) };
}

/**
 * Where the reply can be cut for speaking: after the last finished sentence past `from`; the first
 * piece ends at the first comma or full stop.
 */
export function speakableEnd(text: string, from: number): number {
  if (from === 0) {
    // A short opening piece ("Got it,") is voiced fastest, so the voice starts right away.
    const first = text.search(/[,.!?…]\s/);
    if (first >= 4) return first + 2;
  }
  let end = from;
  for (const match of text.matchAll(/[.!?…]+["')\]]*\s+/g)) {
    const at = match.index + match[0].length;
    if (at > end) end = at;
  }
  return end;
}

/**
 * Speaks each agent reply while voice replies are on, a sentence at a time as the reply streams in.
 * Tap-only changes never produce a reply.
 */
export function useSpokenReplies(reply: LiveReply | null, voice: ReturnType<typeof useVoiceReplies>, available: boolean) {
  const on = useRef(false);
  on.current = available && voice.enabled;
  const spoken = useRef({ seq: -1, text: "" });
  const { say, stop } = voice;
  useEffect(() => {
    if (!reply) return;
    const text = reply.text.trimStart();
    if (spoken.current.seq !== reply.seq) {
      // A new reply, or the agent dropped what it had written: stop the old one.
      if (spoken.current.text) stop();
      spoken.current = { seq: reply.seq, text: "" };
    }
    if (!on.current) return;
    const said = spoken.current.text;
    // The saved reply differs from what streamed (e.g. the fallback when the model wrote nothing): say it all.
    if (!text.startsWith(said)) {
      stop();
      spoken.current.text = text;
      say(text);
      return;
    }
    const end = reply.done ? text.length : speakableEnd(text, said.length);
    if (end <= said.length) return;
    spoken.current.text = text.slice(0, end);
    say(text.slice(said.length, end));
  }, [reply, say, stop]);
}
