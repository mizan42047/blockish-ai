import { ChatOpenAI } from "@langchain/openai";

type ChatOpenAIConfig = NonNullable<ConstructorParameters<typeof ChatOpenAI>[0]>;

export type CreateModelConfig = ChatOpenAIConfig & {
  model: string;
  temperature: number;
};

export function createModel(config: CreateModelConfig) {
  return new ChatOpenAI(config);
}
