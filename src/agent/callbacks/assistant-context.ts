import type {
  AssistantContext,
  AssistantExtensionsContext,
} from "./assistant.types.js";

export function getAssistantContext(value: unknown): AssistantContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as AssistantContext;
}

export function getAssistantExtensionsContext(
  classManager: unknown
): AssistantExtensionsContext | null {
  return {
    classManager: Array.isArray(classManager) ? classManager : [],
  };
}

export function getSchemaPrev(
  context: AssistantContext | null,
  extensions: AssistantExtensionsContext | null
) {
  if (!context?.blocks?.length && !extensions?.classManager?.length) {
    return null;
  }

  return {
    scope: context?.scope ?? "selection",
    mode: context?.mode ?? "blocks",
    extensions: {
      classManager: extensions?.classManager ?? [],
    },
    blocks: context?.blocks ?? [],
  };
}
