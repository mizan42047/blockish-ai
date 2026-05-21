import type { CreateModelConfig } from "agent/utility/create-model.js";
import { config } from "config.js";

export function createAssistantModelConfig(): CreateModelConfig {
  return {
    apiKey: config.openAiApiKey,
    configuration: {
      baseURL: config.ollamaBaseUrl,
    },
    model: config.aiModel,
    temperature: 0.5,
  };
}
