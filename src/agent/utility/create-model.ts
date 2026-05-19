import { ChatOllama } from "@langchain/ollama";

export type CreateModelConfig = {
  baseUrl: string;
  model: string;
  temperature: number;
};

export function createModel(config: CreateModelConfig) {
  return new ChatOllama(config);
}
