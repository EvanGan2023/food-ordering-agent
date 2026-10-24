import { describe, expect, it } from "vitest";
import { kokoroConfigFromEnv, sentences, streamingWavHeader, toPcm16 } from "../src/kokoro";

describe("kokoroConfigFromEnv", () => {
  it("is off unless TTS_PROVIDER=kokoro", () => {
    expect(kokoroConfigFromEnv({})).toBeNull();
    expect(kokoroConfigFromEnv({ TTS_PROVIDER: "elevenlabs" })).toBeNull();
  });

  it("defaults to a small, fast model and the af_heart voice", () => {
    expect(kokoroConfigFromEnv({ TTS_PROVIDER: "kokoro" })).toEqual({ voice: "af_heart", dtype: "q8", speed: 1 });
  });

  it("reads voice, quality and speed, ignoring bad values", () => {
    expect(kokoroConfigFromEnv({ TTS_PROVIDER: "kokoro", KOKORO_VOICE: "bf_emma", KOKORO_DTYPE: "fp32", KOKORO_SPEED: "1.2" })).toEqual({
      voice: "bf_emma",
      dtype: "fp32",
      speed: 1.2,
    });
    expect(kokoroConfigFromEnv({ TTS_PROVIDER: "kokoro", KOKORO_DTYPE: "huge", KOKORO_SPEED: "9" })).toMatchObject({ dtype: "q8", speed: 1 });
  });
});

describe("sentences", () => {
  it("splits a reply so the first sentence can play early", () => {
    expect(sentences("Two meals and a large fries. Which drinks? Anything else!")).toEqual([
      "Two meals and a large fries.",
      "Which drinks?",
      "Anything else!",
    ]);
  });

  it("cuts a long opening sentence without a comma before a joining word", () => {
    expect(sentences("Did you mean a large Taro Milk Tea with 50% sugar and less ice?")).toEqual([
      "Did you mean a large Taro Milk Tea",
      "with 50% sugar and less ice?",
    ]);
    expect(sentences("Which drink would you like?")).toEqual(["Which drink would you like?"]);
  });

  it("cuts a long opening sentence at its first comma so speech starts sooner", () => {
    expect(sentences("Two Cheeseburger Meals, one without pickles, and a large fries. Which drinks?")).toEqual([
      "Two Cheeseburger Meals,",
      "one without pickles, and a large fries.",
      "Which drinks?",
    ]);
  });

  it("keeps prices and text without a full stop intact", () => {
    expect(sentences("That's $23.40 in total")).toEqual(["That's $23.40 in total"]);
  });
});

describe("WAV streaming", () => {
  it("writes a 24 kHz, 16-bit mono header", () => {
    const header = new DataView(streamingWavHeader().buffer);
    const tag = (offset: number) => String.fromCharCode(...new Uint8Array(header.buffer, offset, 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(24_000);
    expect(header.getUint16(34, true)).toBe(16);
  });

  it("converts samples to 16-bit PCM, clipping out-of-range values", () => {
    const pcm = new DataView(toPcm16(new Float32Array([0, 1, -1, 2])).buffer);
    expect([pcm.getInt16(0, true), pcm.getInt16(2, true), pcm.getInt16(4, true), pcm.getInt16(6, true)]).toEqual([0, 32767, -32768, 32767]);
  });
});
