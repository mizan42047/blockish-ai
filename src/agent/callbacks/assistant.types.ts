export type AssistantMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AssistantImageContent = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type AssistantTextContent = {
  type: "text";
  text: string;
};

export type AssistantModelMessage = Omit<AssistantMessage, "content"> & {
  content: string | Array<AssistantTextContent | AssistantImageContent>;
};

export type AssistantImageAttachment = {
  mimeType?: string;
  name?: string;
  size?: number;
  type: "image";
  url: string;
};

export type AssistantRequestBody = {
  assistantContext?: unknown;
  attachments?: unknown;
  apiKey?: unknown;
  classManager?: unknown;
  input?: unknown;
  interactionResponse?: unknown;
  message?: unknown;
  messages?: unknown;
  threadId?: unknown;
};

export type AssistantContext = {
  blocks?: unknown[];
  mode?: string;
  scope?: string;
};

export type AssistantExtensionsContext = {
  classManager?: unknown[];
};

export type AssistantInteractionOption = {
  label: string;
  value: string;
};

export type AssistantInteraction = {
  allowCustom?: boolean;
  id: string;
  label?: string;
  options?: AssistantInteractionOption[];
  required?: boolean;
  type:
    | "multi_choice"
    | "single_choice"
    | "text"
    | "yes_no";
  value?: unknown;
};

export type ChatCompatibleResponse = {
  interaction?: AssistantInteraction;
  message: unknown;
  metrics: AssistantMetrics;
  reasoning: string[];
  summary: string;
  todo: string[];
  schema: {
    prev: unknown | null;
    new: unknown | null;
  };
};

export type AssistantMetrics = {
  durationMs: number;
  estimatedTokens?: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AssistantRunEvents = {
  onDelta?: (delta: string, metadata?: AssistantDeltaMetadata) => void | Promise<void>;
  onInterrupt?: (interrupt: AssistantInterrupt) => void | Promise<void>;
  onInteraction?: (
    interaction: AssistantInteraction,
    message: unknown
  ) => void | Promise<void>;
  onStatus?: (message: string) => void | Promise<void>;
  onToolEnd?: (event: AssistantToolEvent) => void | Promise<void>;
  onToolStart?: (event: AssistantToolEvent) => void | Promise<void>;
};

export type AssistantDeltaMetadata = {
  agent?: string;
  source?: string;
};

export type AssistantInterrupt = {
  interaction: AssistantInteraction;
  message: string;
};

export type AssistantToolEvent = {
  agent?: string;
  durationMs?: number;
  error?: unknown;
  input?: unknown;
  name: string;
  output?: unknown;
  status?: string;
};

export type ProductManagerResponse = {
  answer: string;
  interaction?: AssistantInteraction | null;
  reasoning: string[];
  summary: string;
  todo: string[];
};

export type ResultMessage = {
  _getType?: () => string;
  content?: unknown;
  response_metadata?: unknown;
  role?: unknown;
  type?: unknown;
  usage_metadata?: unknown;
};
