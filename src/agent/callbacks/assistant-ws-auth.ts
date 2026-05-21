import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "config.js";

type AssistantWsAuthPayload = {
  expiresAt?: unknown;
  roles?: unknown;
  siteUrl?: unknown;
  userId?: unknown;
};

export type AssistantWsAuthResult = {
  error?: string;
  payload?: AssistantWsAuthPayload;
  valid: boolean;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );

  return Buffer.from(padded, "base64").toString("utf8");
}

function createSignature(payload: string): string {
  return createHmac("sha256", config.assistantWsAuthSecret)
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function getPayload(tokenPayload: string): AssistantWsAuthPayload | null {
  try {
    const parsedPayload = JSON.parse(decodeBase64Url(tokenPayload));

    if (
      !parsedPayload ||
      typeof parsedPayload !== "object" ||
      Array.isArray(parsedPayload)
    ) {
      return null;
    }

    return parsedPayload as AssistantWsAuthPayload;
  } catch {
    return null;
  }
}

export function verifyAssistantWsToken(
  token: string | null
): AssistantWsAuthResult {
  if (!token) {
    return { valid: false, error: "Missing assistant auth token" };
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return { valid: false, error: "Invalid assistant auth token" };
  }

  if (!safeEqual(createSignature(payload), signature)) {
    return { valid: false, error: "Invalid assistant auth signature" };
  }

  const decodedPayload = getPayload(payload);

  if (!decodedPayload) {
    return { valid: false, error: "Invalid assistant auth payload" };
  }

  if (
    typeof decodedPayload.expiresAt !== "number" ||
    decodedPayload.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return { valid: false, error: "Assistant auth token expired" };
  }

  return { valid: true, payload: decodedPayload };
}
