import type {
  LinqWebhookPayload,
  LinqWebhookMessageData,
  LinqWebhookReactionData,
  LinqWebhookTypingData,
} from "../api/types.js";

export interface ParsedInboundMessage {
  kind: "message";
  messageId: string;
  chatId: string;
  from: string;
  to: string;
  text: string;
  attachments: Array<{ url: string; mimeType?: string; filename?: string }>;
  service: string;
  sentAt: string;
}

export interface ParsedStatusEvent {
  kind: "status";
  messageId: string;
  chatId: string;
  status: string;
}

export interface ParsedReactionEvent {
  kind: "reaction";
  messageId: string;
  chatId: string;
  from: string;
  reaction: string;
  added: boolean;
}

export interface ParsedTypingEvent {
  kind: "typing";
  chatId: string;
  from: string;
  started: boolean;
}

export type ParsedEvent =
  | ParsedInboundMessage
  | ParsedStatusEvent
  | ParsedReactionEvent
  | ParsedTypingEvent;

export function parseWebhookEvent(payload: LinqWebhookPayload): ParsedEvent | null {
  switch (payload.event_type) {
    case "message.received":
      return parseMessageReceived(payload.data as LinqWebhookMessageData);

    case "message.delivered":
    case "message.read":
    case "message.failed":
      return parseStatusEvent(payload.event_type, payload.data as LinqWebhookMessageData);

    case "reaction.added":
    case "reaction.removed":
      return parseReactionEvent(payload.event_type, payload.data as LinqWebhookReactionData);

    case "chat.typing_indicator.started":
    case "chat.typing_indicator.stopped":
      return parseTypingEvent(payload.event_type, payload.data as LinqWebhookTypingData);

    default:
      return null;
  }
}

function parseMessageReceived(data: LinqWebhookMessageData): ParsedInboundMessage {
  let text = "";
  const attachments: ParsedInboundMessage["attachments"] = [];

  for (const part of data.parts) {
    if (part.type === "text") {
      text += (text ? "\n" : "") + part.value;
    } else if (part.type === "media") {
      attachments.push({
        url: part.url,
        mimeType: part.mime_type,
        filename: part.filename,
      });
    }
  }

  return {
    kind: "message",
    messageId: data.id,
    chatId: data.chat.id,
    from: data.sender_handle.handle,
    to: data.chat.owner_handle.handle,
    text,
    attachments,
    service: data.service,
    sentAt: data.sent_at,
  };
}

function parseStatusEvent(
  event: string,
  data: LinqWebhookMessageData,
): ParsedStatusEvent {
  return {
    kind: "status",
    messageId: data.id,
    chatId: data.chat.id,
    status: event.replace("message.", ""),
  };
}

function parseReactionEvent(
  event: string,
  data: LinqWebhookReactionData,
): ParsedReactionEvent {
  return {
    kind: "reaction",
    messageId: data.message_id,
    chatId: data.chat_id,
    from: data.from,
    reaction: data.reaction_type,
    added: event === "reaction.added",
  };
}

function parseTypingEvent(
  event: string,
  data: LinqWebhookTypingData,
): ParsedTypingEvent {
  return {
    kind: "typing",
    chatId: data.chat_id,
    from: data.from,
    started: event === "chat.typing_indicator.started",
  };
}
