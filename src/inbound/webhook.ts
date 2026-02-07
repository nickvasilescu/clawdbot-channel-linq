import type { IncomingMessage, ServerResponse } from "node:http";
import type { LinqWebhookPayload } from "../api/types.js";
import { verifyWebhookSignature } from "./verify.js";
import { parseWebhookEvent, type ParsedInboundMessage } from "./events.js";

export interface WebhookHandlerOptions {
  webhookSecret: string;
  onMessage: (msg: ParsedInboundMessage) => Promise<void>;
  onError?: (err: unknown) => void;
  log?: (msg: string) => void;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export function createLinqWebhookHandler(opts: WebhookHandlerOptions) {
  const { webhookSecret, onMessage, onError, log } = opts;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Health check
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("OK");
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    try {
      const rawBody = await readRequestBody(req);

      // Verify signature
      // Linq sends X-Webhook-Signature (raw hex) and X-Webhook-Timestamp
      const signatureHeader =
        typeof req.headers["x-webhook-signature"] === "string"
          ? req.headers["x-webhook-signature"]
          : undefined;
      const timestampHeader =
        typeof req.headers["x-webhook-timestamp"] === "string"
          ? req.headers["x-webhook-timestamp"]
          : undefined;

      const verification = verifyWebhookSignature(
        rawBody,
        signatureHeader,
        timestampHeader,
        webhookSecret,
      );

      if (!verification.valid) {
        log?.(`linq: webhook signature rejected: ${verification.reason}`);
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Unauthorized", reason: verification.reason }));
        return;
      }

      // Respond 200 immediately before processing
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));

      // Parse and process event asynchronously
      let payload: LinqWebhookPayload;
      try {
        payload = JSON.parse(rawBody) as LinqWebhookPayload;
      } catch {
        log?.("linq: webhook body is not valid JSON");
        return;
      }

      const event = parseWebhookEvent(payload);
      if (!event) {
        log?.(`linq: unhandled webhook event type: ${payload.event_type}`);
        return;
      }

      if (event.kind === "message") {
        log?.(`linq: inbound message from ${event.from} (chat=${event.chatId})`);
        await onMessage(event);
      } else if (event.kind === "status") {
        log?.(`linq: message ${event.messageId} status: ${event.status}`);
      } else if (event.kind === "reaction") {
        log?.(`linq: reaction ${event.added ? "added" : "removed"} by ${event.from}: ${event.reaction}`);
      } else if (event.kind === "typing") {
        log?.(`linq: typing ${event.started ? "started" : "stopped"} by ${event.from}`);
      }
    } catch (err) {
      onError?.(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  };
}
