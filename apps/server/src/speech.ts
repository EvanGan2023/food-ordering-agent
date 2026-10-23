/** Speech-to-text and text-to-speech behind one interface, so other providers can plug in later. */
export interface SpeechProvider {
  name: string;
  transcribe(audio: Blob, filename: string): Promise<string>;
  /** Streams spoken audio (MP3) for the text. */
  speak(text: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>;
}

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
  /** ISO-639-1 code; helps accuracy for short orders. Empty = auto-detect. */
  language: string;
}

const API = "https://api.elevenlabs.io/v1";

export function elevenLabsConfigFromEnv(env: Record<string, string | undefined> = process.env): ElevenLabsConfig | null {
  if (!env.ELEVENLABS_API_KEY) return null;
  return {
    apiKey: env.ELEVENLABS_API_KEY,
    voiceId: env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
    // Flash is ElevenLabs' low-latency model; switch to eleven_multilingual_v2 or eleven_v3 for richer voices.
    ttsModel: env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
    sttModel: env.ELEVENLABS_STT_MODEL || "scribe_v2",
    language: env.ELEVENLABS_LANGUAGE ?? "en",
  };
}

export function createElevenLabs(config: ElevenLabsConfig): SpeechProvider {
  const failure = async (what: string, res: Response) => {
    const detail = await res.text().catch(() => "");
    return new SpeechError(`ElevenLabs ${what} failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
  };

  return {
    name: "elevenlabs",

    async transcribe(audio, filename) {
      const form = new FormData();
      form.append("model_id", config.sttModel);
      form.append("file", audio, filename);
      form.append("tag_audio_events", "false");
      if (config.language) form.append("language_code", config.language);

      const res = await fetch(`${API}/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey },
        body: form,
      });
      if (!res.ok) throw await failure("speech-to-text", res);
      const data = (await res.json()) as { text?: string };
      return (data.text ?? "").trim();
    },

    async speak(text) {
      const res = await fetch(`${API}/text-to-speech/${config.voiceId}/stream?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: config.ttsModel }),
      });
      if (!res.ok || !res.body) throw await failure("text-to-speech", res);
      return { body: res.body, contentType: res.headers.get("content-type") ?? "audio/mpeg" };
    },
  };
}
