import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createModel, modelConfigFromEnv } from "@foa/agent";
import { demoMenu } from "@foa/core";
import { createApp } from "./app";
import { migrate, openDb } from "./db";
import { kitchenScreenPos } from "./pos";
import { createElevenLabs, elevenLabsConfigFromEnv } from "./speech";
import { Store } from "./store";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const envFile = `${repoRoot}.env`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 8787);

const db = await openDb({ databaseUrl: process.env.DATABASE_URL, dataDir: `${repoRoot}.data/pglite` });
await migrate(db);

const modelConfig = modelConfigFromEnv();
const model = modelConfig ? createModel(modelConfig) : null;

const speechConfig = elevenLabsConfigFromEnv();
const speech = speechConfig ? createElevenLabs(speechConfig) : null;

const app = createApp({ store: new Store(db), menu: demoMenu, pos: kitchenScreenPos, model, speech, log: true });

serve({ fetch: app.fetch, port }, () => {
  console.log(`API ready on http://localhost:${port}/api`);
  console.log(`Database: ${process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : "embedded PGlite in .data/"}`);
  console.log(
    model
      ? `Agent: ${modelConfig!.provider}${modelConfig!.model ? ` (${modelConfig!.model})` : ""}`
      : "Agent: off. Add ANTHROPIC_API_KEY to .env to turn it on; tap ordering still works.",
  );
  console.log(
    speech
      ? `Speech: ElevenLabs (${speechConfig!.sttModel} / ${speechConfig!.ttsModel})`
      : "Speech: browser speech recognition. Add ELEVENLABS_API_KEY to .env for ElevenLabs.",
  );
});

const shutdown = async () => {
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
