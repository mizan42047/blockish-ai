import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import DEVELOPER_SYSTEM_PROMPT from "../prompts/developer.prompt.json" with { type: "json" };
import { DeveloperResponseSchema } from "assistant/schema/developer.schema.js";
import readBlockishOverview from "assistant/tools/read-blockish-overview.js";
import searchBlockishDocs from "assistant/tools/search-blockish-docs.js";
import type { DeveloperInput } from "assistant/types/developer.type.js";
import { config } from "config.js";

class Developer {
    private readonly agent = createAgent({
        model: new ChatOpenAI({
            model: config.model,
            apiKey: "ollama",
            configuration: { baseURL: `${config.ollamaBaseUrl}/v1` },
            temperature: 0,
        }),
        tools: [readBlockishOverview, searchBlockishDocs],
        systemPrompt: DEVELOPER_SYSTEM_PROMPT.join("\n"),
        responseFormat: DeveloperResponseSchema,
    });

    public async run(guide: DeveloperInput) {
        console.log(`[developer] generating with ${config.model}...`);

        const result = await this.agent.invoke({
            messages: [{ role: "user", content: JSON.stringify(guide) }],
        });

        if (result.structuredResponse) return result.structuredResponse;

        const content = result.messages.at(-1)?.content?.toString() ?? "";
        const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const json = fenced?.[1]?.trim() ?? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
        return JSON.parse(json);
    }
}

const developerAgent = () => new Developer();
export default developerAgent;
