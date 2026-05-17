import { ChatGoogle } from "@langchain/google";
import {
  ChatOpenRouter,
} from "@langchain/openrouter";
import type { AiProvider } from "config.js";

type BaseCreateModelConfig = {
  apiKey: string;
  model: string;
  provider: AiProvider;
  temperature: number;
};

export type CreateModelConfig = BaseCreateModelConfig & {
  siteName?: string;
  siteUrl?: string;
};

export function createModel(config: CreateModelConfig) {
  const { provider, siteName, siteUrl, ...modelConfig } = config;

  switch (provider) {
    case "gemini":
      return new ChatGoogle(modelConfig);
    case "openrouter":
      return new ChatOpenRouter({
        ...modelConfig,
        siteName,
        siteUrl,
      });
  }
}
