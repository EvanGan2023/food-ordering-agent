"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, Health, Menu, Order, PaymentMethod, SessionView, Selections } from "@foa/core";
import { api, describeError, errorCode } from "./api";

export interface Notice {
  kind: "offline" | "error";
  text: string;
}

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the order still works, it just won't survive a refresh.
  }
}

/**
 * Owns one ordering session: loading the menu, creating or restoring the session,
 * and every cart, chat, answer and checkout call. Pages only render what it returns.
 */
export function useOrderSession(channel: Channel, storageKey?: string) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [assistantDown, setAssistantDown] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  /** The agent's latest chat reply; `seq` changes even when the same text repeats. Tap changes never set it. */
  const [lastReply, setLastReply] = useState<{ text: string; seq: number } | null>(null);
  const sessionId = useRef<string | null>(null);

  const remember = useCallback(
    (next: SessionView) => {
      sessionId.current = next.id;
      setSession(next);
      if (storageKey) writeStorage(storageKey, next.id);
    },
    [storageKey],
  );

  const startNew = useCallback(async () => {
    const fresh = await api.createSession(channel);
    remember(fresh);
    setOrder(null);
    if (storageKey) writeStorage(`${storageKey}:order`, null);
    return fresh;
  }, [channel, remember, storageKey]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const menuPromise = api.menu();
      api.health().then(
        (h) => {
          setHealth(h);
          setAssistantDown(!h.agent);
        },
        () => setAssistantDown(true),
      );
      let restored: SessionView | null = null;
      const savedId = storageKey ? readStorage(storageKey) : null;
      if (savedId) restored = await api.session(savedId).catch(() => null);

      if (restored?.status === "open") {
        remember(restored);
      } else {
        const savedOrder = storageKey ? readStorage(`${storageKey}:order`) : null;
        if (restored && savedOrder) {
          // Refreshed on the confirmation screen: keep showing it.
          remember(restored);
          setOrder(JSON.parse(savedOrder) as Order);
        } else {
          await startNew();
        }
      }
      setMenu(await menuPromise);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }, [remember, startNew, storageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const fail = useCallback(
    (err: unknown) => {
      const code = errorCode(err);
      if (code === "agent_unavailable" || code === "network") {
        setAssistantDown(true);
        setNotice({ kind: "offline", text: describeError(err) });
      } else {
        setNotice({ kind: "error", text: describeError(err) });
      }
      // Re-sync so the screen matches the server after a rejected change.
      if (sessionId.current && code !== "network") {
        api.session(sessionId.current).then(setSession, () => undefined);
      }
    },
    [],
  );

  /** Runs a cart or answer call; returns true if it succeeded. */
  const mutate = useCallback(
    async (call: (id: string) => Promise<SessionView>) => {
      const id = sessionId.current;
      if (!id) return false;
      setBusy(true);
      try {
        remember(await call(id));
        setNotice((n) => (n?.kind === "error" ? null : n));
        return true;
      } catch (err) {
        fail(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [fail, remember],
  );

  const send = useCallback(
    async (text: string) => {
      const id = sessionId.current;
      if (!id || !text.trim()) return false;
      setThinking(text);
      try {
        const res = await api.message(id, text);
        remember(res.session);
        if (res.reply) setLastReply((prev) => ({ text: res.reply, seq: (prev?.seq ?? 0) + 1 }));
        setAssistantDown(false);
        setNotice(null);
        return true;
      } catch (err) {
        fail(err);
        return false;
      } finally {
        setThinking(null);
      }
    },
    [fail, remember],
  );

  const addItem = (itemId: string, modifiers: Selections, qty = 1) =>
    mutate((id) => api.addItem(id, { itemId, modifiers, qty }));
  const setQty = (lineId: string, qty: number) =>
    qty < 1 ? mutate((id) => api.removeLine(id, lineId)) : mutate((id) => api.updateLine(id, lineId, { qty }));
  const removeLine = (lineId: string) => mutate((id) => api.removeLine(id, lineId));
  const updateOptions = (lineId: string, modifiers: Selections) =>
    mutate((id) => api.updateLine(id, lineId, { modifiers }));

  /** Returns an error message to show next to the question, or null on success. */
  const answer = async (questionId: string, value: string): Promise<string | null> => {
    const id = sessionId.current;
    if (!id) return "No active order.";
    setBusy(true);
    try {
      remember(await api.answer(id, questionId, value));
      return null;
    } catch (err) {
      return describeError(err);
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (payment: PaymentMethod) => {
    const id = sessionId.current;
    if (!id) return null;
    setBusy(true);
    try {
      const placed = await api.checkout(id, payment);
      setOrder(placed);
      setNotice(null);
      if (storageKey) writeStorage(`${storageKey}:order`, JSON.stringify(placed));
      api.session(id).then(setSession, () => undefined);
      return placed;
    } catch (err) {
      fail(err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await startNew();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return {
    menu,
    session,
    order,
    loadError,
    busy,
    thinking,
    notice,
    assistantDown,
    health,
    lastReply,
    dismissNotice: () => setNotice(null),
    reload: load,
    send,
    addItem,
    setQty,
    removeLine,
    updateOptions,
    answer,
    checkout,
    reset,
  };
}

export type OrderSession = ReturnType<typeof useOrderSession>;
