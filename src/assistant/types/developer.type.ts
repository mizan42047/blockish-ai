import { createModel } from "assistant/utils/model.js";
import { z } from "zod";

import {
	DeveloperResponseSchema,
	DeveloperInputSchema,
} from "assistant/schema/developer.schema.js";

export type DeveloperModelConfig = Parameters<typeof createModel>[0];

export type DeveloperOptions = {
	modelConfig?: DeveloperModelConfig;
	toolName?: string;
	toolDescription?: string;
	systemPrompt?: string;
};

export type DeveloperConfig = {
	model: ReturnType<typeof createModel>;
	tools: [];
	systemPrompt: string;
	responseFormat: typeof DeveloperResponseSchema;
};

export type DeveloperInput =  z.infer<typeof DeveloperInputSchema>;

export type DeveloperResult = z.infer<typeof DeveloperResponseSchema>;