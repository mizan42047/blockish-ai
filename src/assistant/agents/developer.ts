import { Ollama } from "ollama";
import DEVELOPER_SYSTEM_PROMPT from "../prompts/developer.prompt.json" with { type: "json" };
import type { DeveloperInput } from "assistant/types/developer.type.js";
import readBlockishOverview from "assistant/tools/read-blockish-overview.js";
import searchBlockishDocs from "assistant/tools/search-blockish-docs.js";
import { config } from "config.js";
import { DeveloperResponseJsonSchema } from "assistant/schema/developer.schema.js";

type OllamaMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content?: string;
    tool_name?: string;
    tool_calls?: any[];
    thinking?: string;
};

class Developer {
    private static readonly modelConfig = {
        model: config.generalModel, // example: "gemma4:e4b"
        temperature: 0.2,
        think: true,
        stream: false,
    };

    private static instance: Developer | null = null;

    private messages: OllamaMessage[] = [];
    private firstResponse: any | null = null;
    private finalResponse: any | null = null;

    public readonly config: ReturnType<typeof this.setupConfig>;

    constructor() {
        this.config = this.setupConfig();
        this.resetMessages();
    }

    public static getInstance(): Developer {
        if (!Developer.instance) {
            Developer.instance = new Developer();
        }

        return Developer.instance;
    }

    private setupConfig() {
        const client = new Ollama({
            host: "http://localhost:11434",
        });

        return {
            client,
            modelName: Developer.modelConfig.model,
            temperature: Developer.modelConfig.temperature,
            think: Developer.modelConfig.think,
            systemPrompt: DEVELOPER_SYSTEM_PROMPT.join("\n"),
            responseFormat: DeveloperResponseJsonSchema,
            tools: [readBlockishOverview.tool, searchBlockishDocs.tool],
        };
    }

    private resetMessages() {
        this.messages = [
            {
                role: "system",
                content: this.config.systemPrompt,
            },
        ];

        this.firstResponse = null;
        this.finalResponse = null;
    }

    private addMessage(message: OllamaMessage) {
        this.messages.push(message);
    }

    private async firstChat(message: string) {
        this.addMessage({
            role: "user",
            content: message,
        });

        this.firstResponse = await this.config.client.chat({
            model: this.config.modelName,
            messages: this.messages,
            tools: this.config.tools,
            think: this.config.think,
            stream: false,
            options: {
                temperature: this.config.temperature,
            },
        } as any);

        this.addMessage(this.firstResponse.message as OllamaMessage);

        return this.firstResponse;
    }

    private async secondChat() {
        this.finalResponse = await this.config.client.chat({
            model: this.config.modelName,
            messages: this.messages,
            format: this.config.responseFormat,
            think: this.config.think,
            stream: false,
            options: {
                temperature: 0,
            },
        } as any);

        this.addMessage(this.finalResponse.message as OllamaMessage);

        return this.finalResponse;
    }

    private normalizeToolArgs(args: unknown): Record<string, unknown> {
        if (!args) {
            return {};
        }

        if (typeof args === "string") {
            try {
                return JSON.parse(args);
            } catch {
                return {};
            }
        }

        if (typeof args === "object") {
            return args as Record<string, unknown>;
        }

        return {};
    }

    private async executeTool(toolName: string, args: Record<string, unknown>) {
        switch (toolName) {
            case "read_blockish_overview":
                return readBlockishOverview.execute();

            case "search_blockish_docs":
                return searchBlockishDocs.execute({
                    query: typeof args.query === "string" ? args.query : "",
                });

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private stringifyToolResult(result: unknown): string {
        if (typeof result === "string") {
            return result;
        }

        return JSON.stringify(result);
    }

    private async handleToolCalls(response: any) {
        const toolCalls = response?.message?.tool_calls ?? [];

        if (!toolCalls.length) {
            return;
        }

        for (const toolCall of toolCalls) {
            const toolName = toolCall?.function?.name;

            if (!toolName) {
                continue;
            }

            const toolArgs = this.normalizeToolArgs(
                toolCall?.function?.arguments
            );

            const toolResult = await this.executeTool(toolName, toolArgs);

            this.addMessage({
                role: "tool",
                tool_name: toolName,
                content: this.stringifyToolResult(toolResult),
            });
        }
    }

    public async invoke(message: string) {

        this.resetMessages();

        const firstResponse = await this.firstChat(message);

        await this.handleToolCalls(firstResponse);

        const finalResponse = await this.secondChat();

        return finalResponse;
    }

    public async run(guide: DeveloperInput) {
        const response = await this.invoke(JSON.stringify(guide));
        return response;
        const content = response?.message?.content;

        if (!content) {
            throw new Error("Invalid response format from the model.");
        }

        return JSON.parse(content);
    }
}

const developerAgent = () => Developer.getInstance();

export default developerAgent;