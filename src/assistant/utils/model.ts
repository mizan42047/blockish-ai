import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";

type ChatOpenAIConfig = ConstructorParameters<typeof ChatOpenAI>[0];
type ChatOllamaConfig = ConstructorParameters<typeof ChatOllama>[0];

export function createModel(config: ChatOpenAIConfig): ChatOpenAI {
  return new ChatOpenAI(config);
}

export function createOllamaModel(config: ChatOllamaConfig): ChatOllama {
  return new ChatOllama(config);
}