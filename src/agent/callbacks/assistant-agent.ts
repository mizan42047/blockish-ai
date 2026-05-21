import {
  createProductManagerAgent,
} from "agent/main-agent.js";
import { createAssistantModelConfig } from "./assistant-model-config.js";

export type AssistantAgent = ReturnType<typeof createProductManagerAgent>;

let assistantAgentPromise: Promise<AssistantAgent> | null = null;

async function createAssistantAgent(): Promise<AssistantAgent> {
  const modelConfig = createAssistantModelConfig();

  return createProductManagerAgent({ modelConfig });
}

export function getAssistantAgent(): Promise<AssistantAgent> {
  assistantAgentPromise ??= createAssistantAgent();

  return assistantAgentPromise;
}
