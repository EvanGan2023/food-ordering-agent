"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeError, speakUrl } from "./api";

// The Web Speech API isn't in every TypeScript DOM lib, so we describe the parts we use.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
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
}

/** Push-to-talk with the browser's own speech recognition. `supported` is null until checked on the client. */
export function useBrowserSpeech({ onInterim, onFinal }: SpeechOptions) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = "en-AU";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final.trim()) handlers.current.onFinal(final.trim());
      else handlers.current.onInterim(interim);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow it in your browser settings, or type instead.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("Didn't catch that. Try again or type instead.");
      }
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    setError(null);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, error, start, stop };
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
}

/** Push-to-talk input that uses server transcription when available and the browser's recognition otherwise. */
export function useSpeechInput({ stt, onInterim, onFinal, onStart }: SpeechInputOptions) {
  const [fallback, setFallback] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [recordable, setRecordable] = useState(false);
  const browser = useBrowserSpeech({ onInterim, onFinal });
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

/**
 * Reads the agent's replies aloud via the server's text-to-speech.
 * The on/off choice lives in sessionStorage; it starts off.
 */
export function useVoiceReplies(storageKey: string) {
  const [enabled, setEnabledState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      setEnabledState(sessionStorage.getItem(storageKey) === "1");
    } catch {
      // Ignore blocked storage.
    }
  }, [storageKey]);

  const stop = useCallback(() => {
    const current = audio.current;
    if (!current) return;
    current.onerror = null;
    current.pause();
    current.removeAttribute("src");
    current.load();
    audio.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      if (on) setError(null);
      else stop();
      try {
        sessionStorage.setItem(storageKey, on ? "1" : "0");
      } catch {
        // Ignore blocked storage.
      }
    },
    [stop, storageKey],
  );

  const speak = useCallback(
    (text: string) => {
      stop();
      if (!text.trim()) return;
      const player = new Audio(speakUrl(text));
      const fail = () => {
        if (audio.current !== player) return;
        audio.current = null;
        setEnabled(false);
        setError("Voice replies stopped working, so they're turned off. Replies still show as text.");
      };
      player.onerror = fail;
      player.onended = () => {
        if (audio.current === player) audio.current = null;
      };
      audio.current = player;
      player.play().catch((err: unknown) => {
        // AbortError just means we stopped it for a newer reply.
        if (!(err instanceof DOMException && err.name === "AbortError")) fail();
      });
    },
    [setEnabled, stop],
  );

  return { enabled, setEnabled, speak, stop, error, dismissError: () => setError(null) };
}

/** Speaks each new agent reply while voice replies are on; tap-only changes never produce a reply. */
export function useSpokenReplies(reply: { text: string; seq: number } | null, voice: ReturnType<typeof useVoiceReplies>, available: boolean) {
  const on = useRef(false);
  on.current = available && voice.enabled;
  const { speak } = voice;
  useEffect(() => {
    if (reply && on.current) speak(reply.text);
  }, [reply, speak]);
}
