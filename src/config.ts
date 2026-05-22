import "dotenv/config";

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

export const config = {
  port: Number(getEnv("PORT", "3000")),
  databaseUrl: getEnv("DATABASE_URL"),
  aiModel: getEnv("OLLAMA_MODEL", "qwen3:8b"),
  ollamaBaseUrl: getOptionalEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434",
  pexelsApiKey: getOptionalEnv("PEXELS_API_KEY"),
};
