import "dotenv/config";

export type AiProvider =
  | "gemini"
  | "openrouter";

const supportedProviders: AiProvider[] = [
  "gemini",
  "openrouter",
];

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];

  if (!value) {
    if (defaultValue) return defaultValue;
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();

  return value || undefined;
}

function getAiProvider(): AiProvider {
  const provider = getEnv("AI_PROVIDER", "openrouter").toLowerCase();

  if (supportedProviders.includes(provider as AiProvider)) {
    return provider as AiProvider;
  }

  throw new Error(
    `Invalid AI_PROVIDER: ${provider}. Supported providers: ${supportedProviders.join(", ")}`
  );
}

function getProviderApiKey(provider: AiProvider) {
  switch (provider) {
    case "gemini":
      return getEnv("GEMINI_API_KEY");
    case "openrouter":
      return getEnv("OPENROUTER_API_KEY");
  }
}

function getProviderModel(provider: AiProvider) {
  switch (provider) {
    case "gemini":
      return getEnv("GEMINI_MODEL", "gemini-2.5-flash");
    case "openrouter":
      return getEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite");
  }
}

const aiProvider = getAiProvider();

export const config = {
  port: Number(getEnv("PORT", "3000")),
  databaseUrl: getEnv("DATABASE_URL"),
  aiApiKey: getProviderApiKey(aiProvider),
  aiModel: getProviderModel(aiProvider),
  aiProvider,
  openRouterSiteUrl: getOptionalEnv("OPENROUTER_SITE_URL") ?? "https://blockish.app",
};
