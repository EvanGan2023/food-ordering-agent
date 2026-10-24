import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createModel, modelConfigFromEnv } from "@foa/agent";
import { demoMenu, teaMenu, type Menu } from "@foa/core";
import { createApp } from "./app";
import { migrate, openDb, postgresOptionsFromEnv } from "./db";
import { kitchenScreenPos } from "./pos";
import { createKokoro, kokoroConfigFromEnv } from "./kokoro";
import { createElevenLabs, elevenLabsConfigFromEnv, type TextToSpeech } from "./speech";
import { Store } from "./store";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const envFile = `${repoRoot}.env`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 8787);

// Which fictional demo menu to serve: DEMO_MENU=bubble-tea, or the burger shop by default.
const demoMenus: Record<string, Menu> = { burger: demoMenu, "bubble-tea": teaMenu };
const menu = demoMenus[process.env.DEMO_MENU || "burger"];
if (!menu) {
  console.error(`Unknown DEMO_MENU "${process.env.DEMO_MENU}". Use one of: ${Object.keys(demoMenus).join(", ")}.`);
  process.exit(1);
}

const postgres = postgresOptionsFromEnv();
const db = await openDb({ postgres, dataDir: `${repoRoot}.data/pglite` });
await migrate(db);

const modelConfig = modelConfigFromEnv();
const model = modelConfig ? createModel(modelConfig) : null;

// Listening: ElevenLabs with a key, else the browser. Speaking: TTS_PROVIDER=kokoro (free, local),
// else ElevenLabs with a key, else text only.
const elevenConfig = elevenLabsConfigFromEnv();
const eleven = elevenConfig ? createElevenLabs(elevenConfig) : null;
const kokoroConfig = kokoroConfigFromEnv();
const kokoro = kokoroConfig ? createKokoro(kokoroConfig) : null;
const tts: TextToSpeech | null = kokoro ?? eleven;

const app = createApp({ store: new Store(db), menu, pos: kitchenScreenPos, model, stt: eleven, tts, log: true });

serve({ fetch: app.fetch, port }, () => {
  console.log(`API ready on http://localhost:${port}/api`);
  console.log(`Menu: ${menu.name}`);
  console.log(
    `Database: ${postgres ? `Postgres at ${new URL(postgres.url).hostname}${postgres.caFile ? " (verified SSL)" : ""}` : "embedded PGlite in .data/"}`,
  );
  console.log(
    model
      ? `Agent: ${modelConfig!.provider}${modelConfig!.model ? ` (${modelConfig!.model})` : ""}`
      : "Agent: off. Add ANTHROPIC_API_KEY to .env; until then the ordering screens show \"assistant offline\".",
  );
  console.log(`Listening: ${eleven ? `ElevenLabs (${elevenConfig!.sttModel})` : "browser speech recognition"}`);
  console.log(
    `Speaking: ${
      kokoro
        ? `Kokoro, free and local (voice ${kokoroConfig!.voice}); loading the model…`
        : eleven
          ? `ElevenLabs (${elevenConfig!.ttsModel})`
          : "off. Set TTS_PROVIDER=kokoro (free) or ELEVENLABS_API_KEY in .env."
    }`,
  );
  // Load Kokoro now so the first customer doesn't wait for it.
  kokoro?.warmUp().then(
    () => console.log("Kokoro voice ready."),
    (err: unknown) => console.error("Kokoro failed to load:", err),
  );
});

const shutdown = async () => {
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
