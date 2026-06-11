import { tool } from "langchain";
import { z } from "zod";
import type { Socket } from "socket.io";

export const createAskUserTool = (socket: Socket) =>
    tool(
        ({ question }) => {
            return new Promise<string>((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("No response from user after 5 minutes")),
                    5 * 60 * 1000
                );
                socket.emit("pm:question", { question });
                socket.once("pm:answer", ({ answer }: { answer: string }) => {
                    clearTimeout(timeout);
                    resolve(answer);
                });
            });
        },
        {
            name: "ask_user",
            description: "Ask the user a clarifying question and wait for their response. Use this to gather requirements, preferences, or asset URLs needed to write the design guideline.",
            schema: z.object({
                question: z.string().describe("The question to ask the user"),
            }),
        }
    );
