import type { Response } from "express";

export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    ok: true,
    data,
  });
}

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  error: string,
  details?: Record<string, unknown>
): Response {
  return res.status(statusCode).json({
    ok: false,
    error,
    ...details,
  });
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseNumber(value: unknown): number | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function parseDate(value: unknown): Date | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
