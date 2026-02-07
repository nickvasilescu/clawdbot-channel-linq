import { LinqClient } from "../api/client.js";
import type { LinqMessagePart, LinqService } from "../api/types.js";
import { readChatStore, writeChatStore } from "./chat-store.js";

export interface SendLinqMessageOptions {
  apiToken: string;
  fromNumber: string;
  preferredService?: LinqService;
}

/**
 * Find or create a Linq chat for a recipient, then send a message.
 * Chat IDs are cached in a local store keyed by phone number.
 */
export async function sendMessageLinq(
  to: string,
  parts: LinqMessagePart[],
  opts: SendLinqMessageOptions,
): Promise<{ messageId: string; chatId: string }> {
  const client = new LinqClient({ apiToken: opts.apiToken });
  const normalizedTo = to.replace(/^linq:/i, "");

  // Look up existing chat ID
  let chatId = readChatStore(normalizedTo);

  if (!chatId) {
    // Create a new chat
    const chatResp = await client.createChat(opts.fromNumber, [normalizedTo]);
    chatId = chatResp.chat.id;
    writeChatStore(normalizedTo, chatId);
  }

  // Filter out empty text parts — Linq API rejects empty parts
  const validParts = parts.filter((p) => {
    if (p.type === "text") return Boolean(p.value?.trim());
    return true;
  });
  if (validParts.length === 0) {
    return { messageId: "", chatId };
  }

  const msgResp = await client.sendMessage(chatId, validParts, {
    service: opts.preferredService,
  });

  return {
    messageId: msgResp.message?.id ?? "",
    chatId: (msgResp as any).chat_id ?? chatId,
  };
}

/**
 * Send a text message via Linq.
 */
export async function sendTextLinq(
  to: string,
  text: string,
  opts: SendLinqMessageOptions,
): Promise<{ messageId: string; chatId: string }> {
  return sendMessageLinq(to, [{ type: "text", value: text }], opts);
}

/**
 * Send a media message via Linq (optionally with text caption).
 */
export async function sendMediaLinq(
  to: string,
  mediaUrl: string,
  text: string | undefined,
  opts: SendLinqMessageOptions,
): Promise<{ messageId: string; chatId: string }> {
  const parts: LinqMessagePart[] = [];
  if (text) parts.push({ type: "text", value: text });
  parts.push({ type: "media", url: mediaUrl });
  return sendMessageLinq(to, parts, opts);
}
