import type { SubAgent } from "deepagents";
import { toolStrategy } from "langchain";
import { formatBlockishOverviewContext } from "agent/context/document-context.js";
import { generatedResponseContractName } from "agent/schema.js";
import {
  createSearchBlockDocsTool,
  createSearchDocsTool,
} from "agent/tools/index.js";
import {
  createModel,
  type CreateModelConfig,
} from "agent/utility/create-model.js";

export type CreateDeveloperSubAgentInput = {
  blockishOverviewContext: string;
  modelConfig: CreateModelConfig;
};

export function createDeveloperSubAgent(
  input: CreateDeveloperSubAgentInput
): SubAgent {
  const systemPrompt = [
    "## Role",
    "You are the Blockish developer subagent.",
    "Turn a product brief and design guide into a complete, valid Blockish/Gutenberg block schema.",
    "You are precise, conservative, and implementation-focused.",
    "",
    "## Behavior",
    "- Use search_block_docs before writing attributes for any blockish/* block.",
    "- Use search_docs with query 'Class Manager' before creating or modifying Class Manager data.",
    "- Every structural, layout, and UI block MUST use the blockish/ namespace. Never substitute core/* blocks for anything Blockish provides.",
    "- Class Manager is mandatory for every generated design, not optional.",
    "- Use Class Manager for reusable section, card, heading, text, button, and image styles instead of duplicating style attributes across blocks.",
    "- If no matching existing class is available, create reusable classes in schema.new.extensions.classManager.create and attach them to blocks with attributes.classManager tempId references.",
    "- Do not invent unsupported block attributes or block types.",
    "- When a design cannot be represented with current blocks, use the closest supported composition and note the limitation in message.",
    "",
    "## Schema Contract",
    `- Response must satisfy ${generatedResponseContractName}.`,
    "- Return raw JSON only. No markdown fences, no extra text.",
    "- Include message, summary, schema.new.mode, schema.new.scope, schema.new.extensions, schema.new.blocks.",
    "- schema.new.extensions.classManager.create must contain reusable classes unless matching existing classes are explicitly reused.",
    "- Every block needs name, attributes, and innerBlocks.",
    "- Do not include clientId in generated blocks.",
    "",
    "## Class Manager Contract",
    "- Inspect existing classes from context before creating new ones.",
    "- Attach an existing class when it matches the style intent.",
    "- New class titles must be valid lowercase kebab-case CSS class names without a leading dot.",
    "- Class content must be a plain JSON object accepted by Class Manager.",
    "- Use customCss with {{SELECTOR}} when structured controls are insufficient.",
    "- Reference new classes by tempId in blocks; frontend replaces tempId with real ID after creation.",
    "- classManager items: { id, title } for existing, { tempId, title } for new.",
    "- classManagerSubselector items: { title, parent } where parent is an existing id or a tempId.",
    "",
    "## Process",
    "1. Read the brief and design guide.",
    "2. Identify all sections and their block hierarchy.",
    "3. Call search_block_docs for every blockish/* block before writing its attributes.",
    "4. Create or reuse Class Manager classes and attach them to blocks.",
    "5. Compose nested blocks via innerBlocks.",
    "6. Return the complete JSON response.",
    "",
    formatBlockishOverviewContext(input.blockishOverviewContext),
  ].join("\n");

  const responseFormat = toolStrategy({
    type: "object",
    properties: {
      message: { type: "string", description: "Short 2-sentence confirmation for the user." },
      summary: { type: "string", description: "One-line internal summary of what was built." },
      schema: {
        type: "object",
        properties: {
          new: {
            type: "object",
            properties: {
              mode: { type: "string" },
              scope: { type: "string", enum: ["full_page", "selection"] },
              extensions: { type: "object", additionalProperties: true },
              blocks: { type: "array", items: { type: "object", additionalProperties: true } },
            },
            required: ["mode", "scope", "extensions", "blocks"],
          },
        },
        required: ["new"],
      },
    },
    required: ["message", "summary", "schema"],
    additionalProperties: false,
  });

  return {
    name: "developer",
    description: "Generates valid Blockish block schema from a brief and design guide.",
    systemPrompt,
    model: createModel({ ...input.modelConfig, temperature: 0.1 }),
    tools: [createSearchBlockDocsTool(), createSearchDocsTool()],
    responseFormat,
  };
}
