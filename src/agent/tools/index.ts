import { tool } from "langchain";
import { getDocuments } from "routes/document.ropository.js";
import { upsertBlockSuggestion } from "routes/block-suggestions.repository.js";

type SearchBlockDocsToolInput = {
  blockName: string;
  limit?: number;
};

type SearchDocsToolInput = {
  limit?: number;
  query: string;
};

type SuggestMissingBlockToolInput = {
  exampleUsage?: string;
  metadata?: Record<string, unknown>;
  priority?: string;
  rationale: string;
  summary: string;
  title: string;
};

const searchBlockDocsSchema = {
  type: "object",
  properties: {
    blockName: {
      type: "string",
      description: "The Blockish block name to search for, for example Container, Accordion, Rating, or Google Map.",
    },
    limit: {
      type: "number",
      description: "Maximum matching documents to return. Defaults to 3.",
    },
  },
  required: ["blockName"],
  additionalProperties: false,
} as const;

const suggestMissingBlockSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Short name for the missing block, for example Feature Matrix.",
    },
    summary: {
      type: "string",
      description: "One-sentence summary of what the block should do.",
    },
    rationale: {
      type: "string",
      description: "Why this block would improve the design or reduce awkward composition.",
    },
    exampleUsage: {
      type: "string",
      description: "How the block would be used in this page or a future Blockish page.",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "How important this block feels for future Blockish capability.",
    },
    metadata: {
      type: "object",
      description: "Optional supporting details, such as section name or current workaround.",
      additionalProperties: true,
    },
  },
  required: ["title", "summary", "rationale"],
  additionalProperties: false,
} as const;

const searchDocsSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The documentation search query.",
    },
    limit: {
      type: "number",
      description: "Maximum matching documents to return. Defaults to 3.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

function truncateContent(content: string, maxLength = 5000) {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength)}\n...[truncated]`;
}

export function createSearchBlockDocsTool() {
  return tool(
    async (input) => {
      const searchInput = input as SearchBlockDocsToolInput;
      const limit = typeof searchInput.limit === "number"
        ? Math.max(1, Math.min(5, Math.floor(searchInput.limit)))
        : 3;
      const docs = await getDocuments({
        search: searchInput.blockName,
        limit,
        orderBy: "updated_at",
        order: "desc",
      });

      if (!docs.length) {
        return `No Blockish documents found for block name: ${searchInput.blockName}.`;
      }

      return JSON.stringify({
        query: searchInput.blockName,
        results: docs.map((document) => ({
          source_id: document.source_id,
          title: document.title,
          category: document.category,
          metadata: document.metadata,
          content: truncateContent(document.content),
        })),
      });
    },
    {
      name: "search_block_docs",
      description: "Search Blockish documentation by block name and return matching docs for schema/implementation work.",
      schema: searchBlockDocsSchema,
    }
  );
}

export function createSearchDocsTool() {
  return tool(
    async (input) => {
      const searchInput = input as SearchDocsToolInput;
      const limit = typeof searchInput.limit === "number"
        ? Math.max(1, Math.min(5, Math.floor(searchInput.limit)))
        : 3;
      const docs = await getDocuments({
        search: searchInput.query,
        limit,
        orderBy: "updated_at",
        order: "desc",
      });

      if (!docs.length) {
        return `No Blockish documents found for query: ${searchInput.query}.`;
      }

      return JSON.stringify({
        query: searchInput.query,
        results: docs.map((document) => ({
          source_id: document.source_id,
          title: document.title,
          category: document.category,
          metadata: document.metadata,
          content: truncateContent(document.content, 8000),
        })),
      });
    },
    {
      name: "search_docs",
      description: "Search Blockish documentation by any query, including extension docs such as Class Manager.",
      schema: searchDocsSchema,
    }
  );
}

export function createSuggestMissingBlockTool() {
  return tool(
    async (input) => {
      const suggestionInput = input as SuggestMissingBlockToolInput;
      const suggestion = await upsertBlockSuggestion({
        title: suggestionInput.title,
        summary: suggestionInput.summary,
        rationale: suggestionInput.rationale,
        exampleUsage: suggestionInput.exampleUsage,
        priority: suggestionInput.priority,
        metadata: suggestionInput.metadata,
        sourceAgent: "designer",
      });

      return [
        `Saved block suggestion: ${suggestion.title}.`,
        `Priority: ${suggestion.priority}.`,
        `Mention count: ${suggestion.mention_count}.`,
      ].join(" ");
    },
    {
      name: "suggest_missing_block",
      description: "Save a future Blockish block suggestion when an absent block would materially improve a design.",
      schema: suggestMissingBlockSchema,
    }
  );
}
