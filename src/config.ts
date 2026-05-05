import "dotenv/config";

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];

  if (!value) {
    if (defaultValue) return defaultValue;
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

export const config = {
  port: Number(getEnv("PORT", "3000")),
  databaseUrl: getEnv("DATABASE_URL"),
};