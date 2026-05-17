import {
  ChatOpenRouter,
  type ChatOpenRouterInput,
} from "@langchain/openrouter";

export type CreateModelConfig = ChatOpenRouterInput;

export function createModel(config: CreateModelConfig) {
  return new ChatOpenRouter(config);
}
