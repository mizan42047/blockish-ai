import {
  validateGeneratedResponse,
  type BlockishGeneratedResponse,
} from "agent/schema.js";
import { getResultMessages } from "./assistant-result.js";

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  const objMatch = trimmed.match(/\{[\s\S]+\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {}
  }

  return null;
}

function sanitizeDeveloperSchema(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const schema = obj.schema as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return value;
  }

  const schemaNew = schema.new as Record<string, unknown> | undefined;
  if (!schemaNew || typeof schemaNew !== "object" || Array.isArray(schemaNew)) {
    return value;
  }

  if (
    !schemaNew.scope ||
    (schemaNew.scope !== "full_page" && schemaNew.scope !== "selection")
  ) {
    const raw = String(schemaNew.scope ?? "").toLowerCase();
    schemaNew.scope = raw.includes("full") || raw.includes("page")
      ? "full_page"
      : "selection";
  }

  if (typeof schemaNew.mode !== "string" || !schemaNew.mode) {
    schemaNew.mode = "blocks";
  }

  if (
    !schemaNew.extensions ||
    typeof schemaNew.extensions !== "object" ||
    Array.isArray(schemaNew.extensions)
  ) {
    schemaNew.extensions = {};
  }

  if (!Array.isArray(schemaNew.blocks)) {
    schemaNew.blocks = [];
  }

  if (typeof obj.message !== "string" || !obj.message.trim()) {
    obj.message = "Schema generated.";
  }

  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    obj.summary = "Schema ready.";
  }

  return value;
}

function findValidatedSchema(value: unknown): BlockishGeneratedResponse | null {
  const validated = validateGeneratedResponse(sanitizeDeveloperSchema(value));

  return validated.value;
}

function findDeveloperSchemaDeep(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): BlockishGeneratedResponse | null {
  if (depth > 8 || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = extractJsonFromText(value);

    return parsed ? findDeveloperSchemaDeep(parsed, seen, depth + 1) : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  const direct = findValidatedSchema(value);

  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const nested = findDeveloperSchemaDeep(value[index], seen, depth + 1);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const priorityKeys = [
    "structuredResponse",
    "output",
    "result",
    "response",
    "content",
    "text",
    "answer",
    "messages",
  ];

  for (const key of priorityKeys) {
    const nested = findDeveloperSchemaDeep(record[key], seen, depth + 1);

    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findDeveloperSchemaDeep(nestedValue, seen, depth + 1);

    if (nested) {
      return nested;
    }
  }

  return null;
}

export function findDeveloperSchemaFromResult(
  result: unknown
): BlockishGeneratedResponse | null {
  const deepResult = findDeveloperSchemaDeep(result);

  if (deepResult) {
    return deepResult;
  }

  const messages = getResultMessages(result);

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    const candidates: string[] = [];

    if (typeof content === "string") {
      candidates.push(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const text = obj.text ?? obj.content ?? obj.output ?? obj.result;

        if (typeof text === "string") {
          candidates.push(text);
        } else if (text !== undefined) {
          candidates.push(JSON.stringify(text));
        }
      }
    }

    for (const text of candidates) {
      if (!text.trim()) continue;

      const parsed = extractJsonFromText(text);
      if (!parsed) continue;

      const sanitized = sanitizeDeveloperSchema(parsed);
      const validated = validateGeneratedResponse(sanitized);
      if (validated.value) return validated.value;
    }
  }

  return null;
}

export function logGeneratedSchema(
  source: string,
  schema: BlockishGeneratedResponse["schema"]["new"] | null | undefined
) {
  if (!schema) {
    console.log(`[assistant:schema:${source}] No schema generated.`);
    return;
  }

  console.log(
    `[assistant:schema:${source}]`,
    JSON.stringify(schema, null, 2)
  );
}
