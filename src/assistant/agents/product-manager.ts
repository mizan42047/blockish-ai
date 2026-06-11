import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { EventEmitter } from "events";
import PRODUCT_MANAGER_SYSTEM_PROMPT from "../prompts/product-manager.prompt.json" with { type: "json" };
import { ProductManagerResponseSchema } from "assistant/schema/product-manager.schema.js";
import { createAskUserTool } from "assistant/tools/ask-user.js";
import type { ProductManagerResult } from "assistant/types/product-manager.type.js";
import type { Socket } from "socket.io";
import { config } from "config.js";

class ProductManager {
    private readonly model = new ChatOpenAI({
        model: config.model,
        apiKey: "ollama",
        configuration: { baseURL: `${config.ollamaBaseUrl}/v1` },
        temperature: 0.7,
    });

    public async run(initialMessage: string, socket: Socket): Promise<ProductManagerResult> {
        const agent = createAgent({
            model: this.model,
            tools: [createAskUserTool(socket)],
            systemPrompt: PRODUCT_MANAGER_SYSTEM_PROMPT.join("\n"),
            responseFormat: ProductManagerResponseSchema,
        });

        let structuredResponse: ProductManagerResult | undefined;

        for await (const event of agent.streamEvents(
            { messages: [{ role: "user", content: initialMessage }] },
            { version: "v2" }
        )) {
            if (event.event === "on_chat_model_stream") {
                const content = event.data?.chunk?.content;
                if (content) socket.emit("pm:stream", { text: content });
            } else if (event.event === "on_chain_end") {
                const output = event.data?.output;
                if (output?.structuredResponse) structuredResponse = output.structuredResponse;
            }
        }

        socket.emit("pm:done", structuredResponse);
        return structuredResponse!;
    }

    public async runHttp(message: string, answers: string[] = []): Promise<ProductManagerResult> {
        let answerIndex = 0;
        const emitter = new EventEmitter();

        const mockSocket = {
            emit: (event: string, _data: unknown) => {
                if (event === "pm:question") {
                    setImmediate(() =>
                        emitter.emit("pm:answer", { answer: answers[answerIndex++] ?? "No preference" })
                    );
                }
            },
            once: (event: string, handler: (...args: unknown[]) => void) => {
                emitter.once(event, handler);
            },
        } as unknown as Socket;

        return this.run(message, mockSocket);
    }
}

const productManagerAgent = () => new ProductManager();
export default productManagerAgent;
