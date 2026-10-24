import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoMenu, type Health } from "@foa/core";
import { createApp } from "../src/app";
import { migrate, openDb, type Db } from "../src/db";
import { kitchenScreenPos } from "../src/pos";
import { SpeechError, elevenLabsConfigFromEnv, type SpeechToText, type TextToSpeech } from "../src/speech";
import { Store } from "../src/store";

let db: Db;
const spoken: string[] = [];

const fakeSpeech: SpeechToText & TextToSpeech = {
  name: "elevenlabs",
  async transcribe(audio) {
    if (audio.size === 3) throw new SpeechError("bad key", 401);
    return "two cheeseburgers please";
  },
  async speak(text) {
    spoken.push(text);
    return { body: new Blob(["mp3"]).stream(), contentType: "audio/mpeg" };
  },
};

const makeApp = (speech: (SpeechToText & TextToSpeech) | null, tts: TextToSpeech | null = speech) =>
  createApp({ store: new Store(db), menu: demoMenu, pos: kitchenScreenPos, model: null, stt: speech, tts });

const recording = (bytes: string) => {
  const form = new FormData();
  form.append("audio", new Blob([bytes], { type: "audio/webm" }), "speech.webm");
  return form;
};

beforeAll(async () => {
  db = await openDb({});
  await migrate(db);
});
afterAll(() => db.close());

describe("speech routes", () => {
  it("reports which speech provider is active", async () => {
    const on = (await (await makeApp(fakeSpeech).request("/api/health")).json()) as Health;
    expect(on.speech).toEqual({ stt: "elevenlabs", tts: "elevenlabs" });
    const off = (await (await makeApp(null).request("/api/health")).json()) as Health;
    expect(off.speech).toEqual({ stt: "browser", tts: null });
  });

  it("mixes providers: browser listening with a local voice", async () => {
    const kokoro: TextToSpeech = {
      name: "kokoro",
      speak: async () => ({ body: new Blob(["wav"]).stream(), contentType: "audio/wav" }),
    };
    const app = makeApp(null, kokoro);
    const health = (await (await app.request("/api/health")).json()) as Health;
    expect(health.speech).toEqual({ stt: "browser", tts: "kokoro" });
    const spokenRes = await app.request("/api/speech/speak?text=Hi");
    expect(spokenRes.headers.get("content-type")).toBe("audio/wav");
    const heard = await app.request("/api/speech/transcribe", { method: "POST", body: recording("audio-bytes") });
    expect(heard.status).toBe(503);
  });

  it("transcribes an uploaded recording", async () => {
    const res = await makeApp(fakeSpeech).request("/api/speech/transcribe", { method: "POST", body: recording("audio-bytes") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "two cheeseburgers please" });
  });

  it("rejects requests without audio", async () => {
    const res = await makeApp(fakeSpeech).request("/api/speech/transcribe", { method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
  });

  it("explains a rejected key", async () => {
    const res = await makeApp(fakeSpeech).request("/api/speech/transcribe", { method: "POST", body: recording("abc") });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string; code: string } }).error.message).toBe("The speech API key was rejected.");
  });

  it("streams spoken replies", async () => {
    const res = await makeApp(fakeSpeech).request(`/api/speech/speak?text=${encodeURIComponent("Anything else?")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("mp3");
    expect(spoken).toEqual(["Anything else?"]);
  });

  it("limits spoken text length", async () => {
    const res = await makeApp(fakeSpeech).request(`/api/speech/speak?text=${"a".repeat(601)}`);
    expect(res.status).toBe(400);
  });

  it("returns speech_unavailable without a key", async () => {
    const res = await makeApp(null).request("/api/speech/speak?text=hi");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string; code: string } }).error.code).toBe("speech_unavailable");
  });

  it("reads ElevenLabs settings from the environment", () => {
    expect(elevenLabsConfigFromEnv({})).toBeNull();
    expect(elevenLabsConfigFromEnv({ ELEVENLABS_API_KEY: "k" })).toMatchObject({
      ttsModel: "eleven_flash_v2_5",
      sttModel: "scribe_v2",
      language: "en",
    });
  });
});
