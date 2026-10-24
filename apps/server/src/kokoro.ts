import type { TextToSpeech } from "./speech";

/**
 * Free, local text-to-speech with Kokoro (open-source, Apache-2.0), run on this server's CPU.
 * The model (~90 MB) downloads once on first use and is cached.
 */
export interface KokoroConfig {
  /** One of Kokoro's voices, e.g. af_heart, af_bella, bf_emma, bm_george. */
  voice: string;
  /** q8 is small and fast on a CPU; fp32 sounds slightly better but is slower. */
  dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
  speed: number;
}

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SAMPLE_RATE = 24_000;

export function kokoroConfigFromEnv(env: Record<string, string | undefined> = process.env): KokoroConfig | null {
  if (env.TTS_PROVIDER !== "kokoro") return null;
  const speed = Number(env.KOKORO_SPEED);
  const dtypes = ["fp32", "fp16", "q8", "q4", "q4f16"] as const;
  const dtype = dtypes.find((d) => d === env.KOKORO_DTYPE) ?? "q8";
  return { voice: env.KOKORO_VOICE || "af_heart", dtype, speed: speed > 0 && speed <= 2 ? speed : 1 };
}

const FIRST_CHUNK_CHARS = 40;

/**
 * Splits a reply into sentences so the first one can play while the rest is generated.
 * A long opening sentence is cut at its first comma, or failing that before a joining word
 * ("with", "and"), so the voice starts sooner: Kokoro makes each piece whole before it plays.
 */
export function sentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = parts[0];
  if (first && first.length > FIRST_CHUNK_CHARS) {
    const comma = first.indexOf(", ", 12);
    const joiner = first.slice(12).search(/ (with|and|for|or|but) /);
    if (comma > 0 && comma < first.length - 12) parts.splice(0, 1, first.slice(0, comma + 1), first.slice(comma + 2));
    else if (joiner >= 0 && 12 + joiner < first.length - 12) parts.splice(0, 1, first.slice(0, 12 + joiner), first.slice(13 + joiner));
  }
  return parts;
}

/** A WAV header for 16-bit mono PCM of unknown length, so the audio can stream as it's made. */
export function streamingWavHeader(sampleRate = SAMPLE_RATE): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  const unknown = 0xffffffff;
  ascii(0, "RIFF");
  header.setUint32(4, unknown, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  ascii(36, "data");
  header.setUint32(40, unknown, true);
  return new Uint8Array(header.buffer);
}

export function toPcm16(samples: Float32Array): Uint8Array {
  const out = new DataView(new ArrayBuffer(samples.length * 2));
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}

interface KokoroModel {
  generate(text: string, options: { voice: string; speed: number }): Promise<{ audio: Float32Array }>;
}

export function createKokoro(config: KokoroConfig): TextToSpeech & { warmUp(): Promise<void> } {
  let model: Promise<KokoroModel> | null = null;
  const load = () => {
    // Imported lazily so servers that don't use Kokoro never load the ONNX runtime.
    model ??= import("kokoro-js").then(
      ({ KokoroTTS }) => KokoroTTS.from_pretrained(MODEL, { dtype: config.dtype, device: "cpu" }) as Promise<KokoroModel>,
    );
    model.catch(() => {
      model = null; // let the next request retry, e.g. after a failed download
    });
    return model;
  };

  // One reply at a time: generation is CPU-heavy, and a queue keeps each reply's audio coming steadily.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    name: "kokoro",

    async warmUp() {
      await load();
    },

    async speak(text) {
      const tts = await load();
      const parts = sentences(text);
      let index = 0;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(streamingWavHeader());
        },
        async pull(controller) {
          const part = parts[index++];
          if (part === undefined) {
            controller.close();
            return;
          }
          const { audio } = await exclusive(() => tts.generate(part, { voice: config.voice, speed: config.speed }));
          controller.enqueue(toPcm16(audio));
        },
      });
      return { body, contentType: "audio/wav" };
    },
  };
}
