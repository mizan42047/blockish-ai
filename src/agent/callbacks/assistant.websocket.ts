import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { createJsonStringFieldReader } from "./assistant-delta.js";
import {
  AssistantRequestError,
  runAssistantRequest,
} from "./assistant-runner.js";
import { verifyAssistantWsToken } from "./assistant-ws-auth.js";
import type { AssistantRequestBody } from "./assistant.types.js";

const assistantWebSocketPath = "/assistant/ws";

type AssistantWebSocketMessage = {
  body?: AssistantRequestBody;
  requestId?: string;
  type?: string;
} & AssistantRequestBody;

function createRequestId(): string {
  return randomUUID();
}

function isAssistantWebSocketPath(request: IncomingMessage): boolean {
  const host = request.headers.host ?? "localhost";
  const requestUrl = new URL(request.url ?? "/", `http://${host}`);

  return requestUrl.pathname === assistantWebSocketPath;
}

function getRequestUrl(request: IncomingMessage): URL {
  const host = request.headers.host ?? "localhost";

  return new URL(request.url ?? "/", `http://${host}`);
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      "\r\n" +
      message
  );
  socket.destroy();
}

function parseMessage(data: RawData): AssistantWebSocketMessage | null {
  try {
    const parsed = JSON.parse(data.toString());

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as AssistantWebSocketMessage;
  } catch {
    return null;
  }
}

function getRequestBody(message: AssistantWebSocketMessage): AssistantRequestBody {
  if (message.body && typeof message.body === "object") {
    return message.body;
  }

  return message;
}

function sendJson(
  socket: WebSocket,
  payload: Record<string, unknown>
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function sendError(
  socket: WebSocket,
  requestId: string,
  error: unknown
): void {
  const message = error instanceof Error
    ? error.message
    : "Failed to run assistant";
  const statusCode = error instanceof AssistantRequestError
    ? error.statusCode
    : 500;

  sendJson(socket, {
    type: "assistant.error",
    requestId,
    ok: false,
    statusCode,
    error: message,
  });
}

function sendStatus(
  socket: WebSocket,
  requestId: string,
  message: string
): void {
  sendJson(socket, {
    type: "assistant.status",
    requestId,
    ok: true,
    data: { message },
  });
}

function handleConnection(socket: WebSocket): void {
  const activeRequests = new Map<string, AbortController>();

  socket.on("message", (data) => {
    const message = parseMessage(data);

    if (!message) {
      sendJson(socket, {
        type: "assistant.error",
        ok: false,
        statusCode: 400,
        error: "Invalid JSON message",
      });
      return;
    }

    const requestId = message.requestId ?? createRequestId();

    if (message.type === "assistant.cancel") {
      activeRequests.get(requestId)?.abort();
      activeRequests.delete(requestId);
      sendJson(socket, {
        type: "assistant.cancelled",
        requestId,
        ok: true,
      });
      return;
    }

    if (message.type && message.type !== "assistant.request") {
      sendJson(socket, {
        type: "assistant.error",
        requestId,
        ok: false,
        statusCode: 400,
        error: "Unsupported assistant WebSocket message type",
      });
      return;
    }

    const abortController = new AbortController();
    activeRequests.set(requestId, abortController);

    sendJson(socket, {
      type: "assistant.started",
      requestId,
      ok: true,
    });
    sendStatus(socket, requestId, "Connected to assistant");

    const answerReader = createJsonStringFieldReader("answer");
    let isAnswerDoneSent = false;
    let didSendInterrupt = false;

    void runAssistantRequest(
      getRequestBody(message),
      abortController.signal,
      {
        onDelta: (delta, metadata) => {
          if (metadata?.source && metadata.source !== "assistant_message") {
            return;
          }

          const answerDelta = answerReader.read(delta);

          if (!answerDelta) {
            if (answerReader.isComplete() && !isAnswerDoneSent) {
              isAnswerDoneSent = true;
              sendJson(socket, {
                type: "assistant.answer_done",
                requestId,
                ok: true,
              });
            }

            return;
          }

          sendJson(socket, {
            type: "assistant.delta",
            requestId,
            ok: true,
            data: { delta: answerDelta },
          });

          if (answerReader.isComplete() && !isAnswerDoneSent) {
            isAnswerDoneSent = true;
            sendJson(socket, {
              type: "assistant.answer_done",
              requestId,
              ok: true,
            });
          }
        },
        onStatus: (statusMessage) => {
          sendStatus(socket, requestId, statusMessage);
        },
        onInteraction: (interaction, interactionMessage) => {
          sendJson(socket, {
            type: "assistant.interaction",
            requestId,
            ok: true,
            data: {
              interaction,
              message: interactionMessage,
            },
          });
        },
        onInterrupt: (interrupt) => {
          didSendInterrupt = true;
          sendJson(socket, {
            type: "assistant.interrupt",
            requestId,
            ok: true,
            data: interrupt,
          });
        },
        onToolStart: (event) => {
          sendJson(socket, {
            type: "assistant.tool_start",
            requestId,
            ok: true,
            data: {
              agent: event.agent,
              name: event.name,
              input: event.input,
            },
          });
        },
        onToolEnd: (event) => {
          sendJson(socket, {
            type: "assistant.tool_end",
            requestId,
            ok: true,
            data: {
              agent: event.agent,
              durationMs: event.durationMs,
              error: event.error instanceof Error
                ? event.error.message
                : event.error,
              name: event.name,
              output: event.output,
              status: event.status,
            },
          });
        },
      }
    )
      .then((data) => {
        if (didSendInterrupt) {
          return;
        }

        sendJson(socket, {
          type: "assistant.final",
          requestId,
          ok: true,
          data,
        });
        sendJson(socket, {
          type: "assistant.done",
          requestId,
          ok: true,
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          if (activeRequests.has(requestId)) {
            sendJson(socket, {
              type: "assistant.cancelled",
              requestId,
              ok: true,
            });
          }

          return;
        }

        console.error("Assistant WebSocket request failed:", error);
        sendError(socket, requestId, error);
      })
      .finally(() => {
        activeRequests.delete(requestId);
      });
  });

  socket.on("close", () => {
    for (const abortController of activeRequests.values()) {
      abortController.abort();
    }

    activeRequests.clear();
  });
}

export function registerAssistantWebSocketServer(server: Server): void {
  const webSocketServer = new WebSocketServer({ noServer: true });

  webSocketServer.on("connection", handleConnection);

  server.on(
    "upgrade",
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!isAssistantWebSocketPath(request)) {
        return;
      }

      const requestUrl = getRequestUrl(request);
      const authResult = verifyAssistantWsToken(
        requestUrl.searchParams.get("token")
      );

      if (!authResult.valid) {
        rejectUpgrade(socket, 401, authResult.error ?? "Unauthorized");
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit("connection", webSocket, request);
      });
    }
  );
}
