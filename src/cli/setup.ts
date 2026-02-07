import { LinqClient } from "../api/client.js";
import type { LinqWebhookEvent } from "../api/types.js";

const DEFAULT_EVENTS: LinqWebhookEvent[] = [
  "message.received",
  "message.delivered",
  "message.read",
  "message.failed",
  "reaction.added",
  "reaction.removed",
  "chat.typing_indicator.started",
  "chat.typing_indicator.stopped",
];

export interface SetupResult {
  subscriptionId: string;
  signingSecret: string;
  targetUrl: string;
  events: LinqWebhookEvent[];
}

/**
 * Create a Linq webhook subscription programmatically.
 * Returns the signing secret needed for webhook verification.
 */
export async function createLinqWebhookSubscription(
  apiToken: string,
  targetUrl: string,
  events?: LinqWebhookEvent[],
): Promise<SetupResult> {
  const client = new LinqClient({ apiToken });
  const result = await client.createWebhookSubscription(
    targetUrl,
    events ?? DEFAULT_EVENTS,
  );
  return {
    subscriptionId: result.subscription.id,
    signingSecret: result.subscription.signing_secret ?? "",
    targetUrl: result.subscription.target_url,
    events: result.subscription.subscribed_events,
  };
}

/**
 * List all active Linq webhook subscriptions.
 */
export async function listLinqWebhookSubscriptions(apiToken: string) {
  const client = new LinqClient({ apiToken });
  const result = await client.listWebhookSubscriptions();
  return result.subscriptions;
}

/**
 * Delete a Linq webhook subscription.
 */
export async function deleteLinqWebhookSubscription(
  apiToken: string,
  subscriptionId: string,
) {
  const client = new LinqClient({ apiToken });
  await client.deleteWebhookSubscription(subscriptionId);
}

/**
 * Verify API credentials by listing chats.
 */
export async function verifyLinqCredentials(
  apiToken: string,
  fromNumber: string,
): Promise<{ ok: boolean; chatCount?: number; error?: string }> {
  try {
    const client = new LinqClient({ apiToken });
    const result = await client.listChats(fromNumber);
    return { ok: true, chatCount: result.chats.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
