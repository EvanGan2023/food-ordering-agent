"use client";

import { useEffect, useRef, useState } from "react";
import { menuFit } from "@foa/core";
import { useSpeechInput, useVoiceReplies } from "./speech";
import type { OrderSession } from "./use-order-session";

/** With voice on, the reply waits this long at most for the voice, so text and voice start together. */
const VOICE_WAIT_MS = 1500;

export type AgentPhase = "idle" | "listening" | "thinking" | "speaking" | "offline";

/**
 * Joins the mic, the agent call and spoken replies into one state for the agent screen:
 * what the orb shows, what the caption says, and how to talk or type.
 */
export function useAgentInput(s: OrderSession, voice: ReturnType<typeof useVoiceReplies>) {
  const [interim, setInterim] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);

  const lastSaid = useRef<string | null>(null);
  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || s.thinking) return false;
    lastSaid.current = trimmed;
    voice.stop();
    // Typing or tapping a button while the mic is on: the typed words win, so stop listening.
    if (speechRef.current?.listening) speechRef.current.stop();
    return s.send(trimmed);
  };
  const speechRef = useRef<{ listening: boolean; stop: () => void } | null>(null);

  const speech = useSpeechInput({
    stt: s.health?.speech.stt,
    // Of the recogniser's guesses, take the one with the most exact menu words; ties keep the likeliest.
    choose: (alternatives) =>
      s.menu
        ? alternatives.reduce((best, alt) => (menuFit(s.menu!, alt) > menuFit(s.menu!, best) ? alt : best), alternatives[0] ?? "")
        : (alternatives[0] ?? ""),
    onStart: () => {
      voice.stop();
      setInterim(null);
      setHeard(null);
    },
    onInterim: (text) => setInterim(text),
    onFinal: (text) => {
      setInterim(null);
      setHeard(text);
      void send(text).finally(() => setHeard(null));
    },
  });

  speechRef.current = speech;

  // Each reply is held back until its voice starts (or VOICE_WAIT_MS passes), so they come together.
  const replySeq = s.reply?.seq ?? -1;
  const replyStarted = !!s.reply?.text.trim();
  const [shownSeq, setShownSeq] = useState(-1);
  useEffect(() => {
    if (voice.speaking) setShownSeq(replySeq);
  }, [voice.speaking, replySeq]);
  useEffect(() => {
    if (!replyStarted) return;
    const timer = setTimeout(() => setShownSeq((shown) => Math.max(shown, replySeq)), VOICE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [replySeq, replyStarted]);
  const voiceOn = voice.enabled && !!s.health?.speech.tts;
  const waitingForVoice = voiceOn && replyStarted && shownSeq < replySeq;

  // The reply so far, while the agent is still writing it.
  const liveReply = s.reply && !s.reply.done && replyStarted && !waitingForVoice ? s.reply.text.trim() : null;

  const phase: AgentPhase = speech.listening
    ? "listening"
    : speech.transcribing || waitingForVoice || ((s.thinking || heard) && !liveReply)
      ? "thinking"
      : voice.speaking || liveReply
        ? "speaking"
        : s.assistantDown
          ? "offline"
          : "idle";

  return {
    phase,
    speech,
    /** What the customer is saying or just said, while it's being handled. */
    userText: speech.listening
      ? speech.interimShown
        ? interim
        : null
      : (s.thinking ?? heard ?? (waitingForVoice ? lastSaid.current : null)),
    liveReply,
    /** The turn hasn't finished, so the order's choices and offers are from the last turn. */
    busy: !!s.thinking || !!heard,
    send,
    toggleMic: () => (speech.listening ? speech.stop() : speech.start()),
  };
}

export type AgentInput = ReturnType<typeof useAgentInput>;
