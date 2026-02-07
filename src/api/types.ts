// ── Linq Partner API v3 Types ──

/** Message part: text content */
export interface LinqTextPart {
  type: "text";
  value: string;
}

/** Message part: media attachment */
export interface LinqMediaPart {
  type: "media";
  url: string;
  mime_type?: string;
  filename?: string;
}

export type LinqMessagePart = LinqTextPart | LinqMediaPart;

/** Preferred service for message delivery */
export type LinqService = "iMessage" | "RCS" | "SMS";

// ── Create Chat ──

export interface LinqCreateChatRequest {
  from: string;
  to: string[];
  initial_message?: {
    parts: LinqMessagePart[];
    service?: LinqService;
  };
}

export interface LinqChat {
  id: string;
  from: string;
  participants: string[];
  service: LinqService;
  created_at: string;
  updated_at: string;
}

export interface LinqCreateChatResponse {
  chat: LinqChat;
  trace_id: string;
}

// ── Send Message ──

export interface LinqSendMessageRequest {
  parts: LinqMessagePart[];
  service?: LinqService;
  reply_to_message_id?: string;
}

export interface LinqMessage {
  id: string;
  chat_id: string;
  from: string;
  parts: LinqMessagePart[];
  service: LinqService;
  direction: "outbound" | "inbound";
  status: "sent" | "delivered" | "read" | "failed";
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  failure_reason?: string;
}

export interface LinqSendMessageResponse {
  message: LinqMessage;
  trace_id: string;
}

// ── List Chats ──

export interface LinqListChatsResponse {
  chats: LinqChat[];
  next_cursor?: string;
  trace_id: string;
}

// ── Webhook Subscriptions ──

export type LinqWebhookEvent =
  | "message.received"
  | "message.delivered"
  | "message.read"
  | "message.failed"
  | "reaction.added"
  | "reaction.removed"
  | "chat.typing_indicator.started"
  | "chat.typing_indicator.stopped";

export interface LinqCreateWebhookRequest {
  target_url: string;
  subscribed_events: LinqWebhookEvent[];
}

export interface LinqWebhookSubscription {
  id: string;
  target_url: string;
  subscribed_events: LinqWebhookEvent[];
  signing_secret?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface LinqCreateWebhookResponse {
  subscription: LinqWebhookSubscription;
  trace_id: string;
}

export interface LinqListWebhooksResponse {
  subscriptions: LinqWebhookSubscription[];
  trace_id: string;
}

export interface LinqDeleteWebhookResponse {
  trace_id: string;
}

// ── Webhook Event Payloads ──

/** Handle object attached to chat participants and message senders */
export interface LinqHandle {
  handle: string;
  id: string;
  is_me: boolean;
  joined_at: string;
  left_at: string | null;
  service: LinqService;
  status: string;
}

/** Top-level webhook envelope */
export interface LinqWebhookPayload {
  api_version: string;
  webhook_version: string;
  event_type: LinqWebhookEvent;
  event_id: string;
  created_at: string;
  trace_id: string;
  partner_id: string;
  data: any;
}

/** Chat object nested in message webhook events */
export interface LinqWebhookChat {
  id: string;
  is_group: boolean;
  owner_handle: LinqHandle;
}

/** data for message.received / message.delivered / message.read / message.failed */
export interface LinqWebhookMessageData {
  chat: LinqWebhookChat;
  id: string;
  parts: LinqMessagePart[];
  sender_handle: LinqHandle;
  direction: "inbound" | "outbound";
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  service: LinqService;
  effect: string | null;
  idempotency_key: string | null;
  preferred_service: string | null;
  reply_to: any | null;
}

/** data for reaction.added / reaction.removed */
export interface LinqWebhookReactionData {
  chat_id: string;
  message_id: string;
  from: string;
  from_handle: LinqHandle;
  is_from_me: boolean;
  reaction_type: string;
  reacted_at: string;
  service: LinqService;
  part_index: number;
  custom_emoji: string | null;
}

/** data for chat.typing_indicator.started / stopped */
export interface LinqWebhookTypingData {
  chat_id: string;
  from: string;
  from_handle?: LinqHandle;
  service?: LinqService;
}

// ── API Error ──

export interface LinqApiError {
  error: {
    code: string;
    message: string;
    trace_id?: string;
  };
}
