import type {
  LinqCreateChatRequest,
  LinqCreateChatResponse,
  LinqCreateWebhookRequest,
  LinqCreateWebhookResponse,
  LinqDeleteWebhookResponse,
  LinqListChatsResponse,
  LinqListWebhooksResponse,
  LinqMessagePart,
  LinqSendMessageRequest,
  LinqSendMessageResponse,
  LinqService,
  LinqWebhookEvent,
} from "./types.js";

const LINQ_API_BASE = "https://api.linqapp.com/api/partner";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export interface LinqClientOptions {
  apiToken: string;
  baseUrl?: string;
}

export class LinqClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(opts: LinqClientOptions) {
    this.apiToken = opts.apiToken;
    this.baseUrl = opts.baseUrl ?? LINQ_API_BASE;
  }

  // ── Chats ──

  async createChat(
    from: string,
    to: string[],
    initialMessage?: { parts: LinqMessagePart[]; service?: LinqService },
  ): Promise<LinqCreateChatResponse> {
    const body: LinqCreateChatRequest = { from, to };
    if (initialMessage) body.initial_message = initialMessage;
    return this.request<LinqCreateChatResponse>("POST", "/v3/chats", body);
  }

  async listChats(from?: string, cursor?: string): Promise<LinqListChatsResponse> {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return this.request<LinqListChatsResponse>("GET", `/v3/chats${qs ? `?${qs}` : ""}`);
  }

  // ── Messages ──

  async sendMessage(
    chatId: string,
    parts: LinqMessagePart[],
    options?: { service?: LinqService; replyToMessageId?: string },
  ): Promise<LinqSendMessageResponse> {
    const message: Record<string, unknown> = { parts };
    if (options?.replyToMessageId) message.reply_to_message_id = options.replyToMessageId;
    const body: Record<string, unknown> = { message };
    if (options?.service) body.service = options.service;
    return this.request<LinqSendMessageResponse>(
      "POST",
      `/v3/chats/${encodeURIComponent(chatId)}/messages`,
      body,
    );
  }

  // ── Typing Indicators ──

  async startTyping(chatId: string): Promise<void> {
    await this.request("POST", `/v3/chats/${encodeURIComponent(chatId)}/typing`);
  }

  async stopTyping(chatId: string): Promise<void> {
    await this.request("DELETE", `/v3/chats/${encodeURIComponent(chatId)}/typing`);
  }

  // ── Read Receipts ──

  async markRead(chatId: string): Promise<void> {
    await this.request("POST", `/v3/chats/${encodeURIComponent(chatId)}/read`);
  }

  // ── Reactions ──

  async addReaction(
    messageId: string,
    type: "love" | "like" | "dislike" | "laugh" | "emphasize" | "question",
  ): Promise<void> {
    await this.request("POST", `/v3/messages/${encodeURIComponent(messageId)}/reactions`, {
      operation: "add",
      type,
    });
  }

  async removeReaction(
    messageId: string,
    type: "love" | "like" | "dislike" | "laugh" | "emphasize" | "question",
  ): Promise<void> {
    await this.request("POST", `/v3/messages/${encodeURIComponent(messageId)}/reactions`, {
      operation: "remove",
      type,
    });
  }

  // ── Webhook Subscriptions ──

  async createWebhookSubscription(
    targetUrl: string,
    events: LinqWebhookEvent[],
  ): Promise<LinqCreateWebhookResponse> {
    const body: LinqCreateWebhookRequest = { target_url: targetUrl, subscribed_events: events };
    return this.request<LinqCreateWebhookResponse>("POST", "/v3/webhook-subscriptions", body);
  }

  async listWebhookSubscriptions(): Promise<LinqListWebhooksResponse> {
    return this.request<LinqListWebhooksResponse>("GET", "/v3/webhook-subscriptions");
  }

  async deleteWebhookSubscription(subscriptionId: string): Promise<LinqDeleteWebhookResponse> {
    return this.request<LinqDeleteWebhookResponse>(
      "DELETE",
      `/v3/webhook-subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  // ── Internal HTTP ──

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiToken}`,
          Accept: "application/json",
        };
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (response.ok) {
          if (response.status === 204) return undefined as T;
          return (await response.json()) as T;
        }

        // Retry on 429 or 5xx
        if (response.status === 429 || response.status >= 500) {
          const errorBody = await response.text().catch(() => "");
          lastError = new Error(
            `Linq API ${method} ${path} failed (${response.status}): ${errorBody}`,
          );
          continue;
        }

        // Non-retryable error
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `Linq API ${method} ${path} failed (${response.status}): ${errorBody}`,
        );
      } catch (err) {
        if (err instanceof TypeError && err.message.includes("fetch")) {
          // Network error - retry
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error(`Linq API ${method} ${path} failed after retries`);
  }
}
