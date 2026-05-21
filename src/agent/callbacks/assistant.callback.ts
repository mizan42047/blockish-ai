import type { Request, Response } from "express";
import { sendErrorResponse } from "utils.js";
import {
  AssistantRequestError,
  runAssistantRequest,
} from "./assistant-runner.js";
import type { AssistantRequestBody } from "./assistant.types.js";

export async function assistantCallback(
  req: Request<{}, unknown, AssistantRequestBody>,
  res: Response
) {
  try {
    const body = req.body ?? {};
    const abortController = new AbortController();

    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const responseData = await runAssistantRequest(
      body,
      abortController.signal
    );

    return res.json({ ok: true, data: responseData });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Failed to run assistant";

    console.error("Assistant request failed:", error);

    if (res.destroyed || res.closed) {
      return;
    }

    if (error instanceof AssistantRequestError) {
      return sendErrorResponse(res, error.statusCode, message);
    }

    return sendErrorResponse(res, 500, message);
  }
}
