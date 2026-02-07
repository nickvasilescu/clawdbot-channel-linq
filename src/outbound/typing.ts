import { LinqClient } from "../api/client.js";
import { readChatStore } from "./chat-store.js";

/**
 * Start typing indicator for a recipient.
 * Requires a known chat ID (recipient must have been messaged before).
 */
export async function startTypingLinq(
  to: string,
  apiToken: string,
): Promise<void> {
  const normalizedTo = to.replace(/^linq:/i, "");
  const chatId = readChatStore(normalizedTo);
  if (!chatId) return; // Can't show typing without a chat
  const client = new LinqClient({ apiToken });
  await client.startTyping(chatId);
}

/**
 * Stop typing indicator for a recipient.
 */
export async function stopTypingLinq(
  to: string,
  apiToken: string,
): Promise<void> {
  const normalizedTo = to.replace(/^linq:/i, "");
  const chatId = readChatStore(normalizedTo);
  if (!chatId) return;
  const client = new LinqClient({ apiToken });
  await client.stopTyping(chatId);
}

/**
 * Mark messages in a chat as read.
 */
export async function markReadLinq(
  to: string,
  apiToken: string,
): Promise<void> {
  const normalizedTo = to.replace(/^linq:/i, "");
  const chatId = readChatStore(normalizedTo);
  if (!chatId) return;
  const client = new LinqClient({ apiToken });
  await client.markRead(chatId);
}
