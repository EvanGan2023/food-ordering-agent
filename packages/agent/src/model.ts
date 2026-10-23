import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export type Provider = "anthropic" | "openai" | "openrouter";

export interface ModelConfig {
  provider: Provider;
  /** Model id for the provider. Optional for anthropic and openai, which have fast defaults. */
  model?: string;
  apiKey: string;
}

const DEFAULT_MODELS: Partial<Record<Provider, string>> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-5-mini",
};

export function createModel(config: ModelConfig): LanguageModel {
  const modelId = config.model || DEFAULT_MODELS[config.provider];
  if (!modelId) throw new Error(`LLM_MODEL is required for provider "${config.provider}"`);

  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(modelId);
    case "openrouter":
      return createOpenRouter({ apiKey: config.apiKey }).chat(modelId);
  }
}

/** Reads LLM_PROVIDER, LLM_MODEL and the provider's API key from the environment. Returns null if no key is set. */
export function modelConfigFromEnv(env: Record<string, string | undefined> = process.env): ModelConfig | null {
  const provider = (env.LLM_PROVIDER ?? "anthropic") as Provider;
  const keyNames: Record<Provider, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  if (!(provider in keyNames)) throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
  const apiKey = env[keyNames[provider]];
  return apiKey ? { provider, model: env.LLM_MODEL, apiKey } : null;
}
