import type { SubAgent } from "deepagents";
import { createSuggestMissingBlockTool } from "agent/tools/index.js";
import {
  createModel,
  type CreateModelConfig,
} from "agent/utility/create-model.js";
import { formatBlockishOverviewContext } from "agent/context/document-context.js";

export type CreateDesignerSubAgentInput = {
  blockishOverviewContext: string;
  modelConfig: CreateModelConfig;
};

export function createDesignerSubAgent(
  input: CreateDesignerSubAgentInput
): SubAgent {
  const systemPrompt = [
    "You are the Blockish designer subagent.",
    "You are highly creative, visual, and precise.",
    "Your job is to turn a product brief into an implementation-ready page design guide for Blockish/Gutenberg blocks.",
    "",
    "Design behavior:",
    "- Create strong visual direction, layout rhythm, section hierarchy, interaction ideas, and content structure.",
    "- Think like a senior web/product designer who understands conversion, scanning, responsive layout, and Gutenberg constraints.",
    "- Be creative, but keep ideas buildable with Blockish blocks and extensions.",
    "- Use the current Blockish block/plugin context first; do not invent unavailable blocks as if they already exist.",
    "- If one or two missing blocks would materially improve the design, call suggest_missing_block with the future block requirement.",
    "- Only suggest missing blocks for real repeated design value, not for tiny one-off styling preferences.",
    "- Prefer concrete design guidance over vague adjectives.",
    "- Mention assumptions clearly when the brief leaves creative gaps.",
    "- Do not create final block schema.",
    "- Do not write application code.",
    "",
    formatBlockishOverviewContext(input.blockishOverviewContext),
  ].join("\n");

  return {
    name: "designer",
    description: "Creative page designer for turning a product brief into an implementation-ready Blockish design guide.",
    systemPrompt,
    model: createModel({
      ...input.modelConfig,
      temperature: 0.9,
    }),
    tools: [createSuggestMissingBlockTool()],
  };
}
