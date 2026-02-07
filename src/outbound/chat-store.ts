import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const STORE_PATH = join(homedir(), ".clawdbot", "credentials", "linq-chats.json");

type ChatStore = Record<string, string>; // phone number -> chat ID

let cachedStore: ChatStore | null = null;

function loadStore(): ChatStore {
  if (cachedStore) return cachedStore;
  try {
    const data = readFileSync(STORE_PATH, "utf-8");
    cachedStore = JSON.parse(data) as ChatStore;
    return cachedStore;
  } catch {
    cachedStore = {};
    return cachedStore;
  }
}

function saveStore(store: ChatStore): void {
  cachedStore = store;
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Best-effort persistence
  }
}

/**
 * Look up a cached Linq chat ID for a phone number.
 */
export function readChatStore(phoneNumber: string): string | undefined {
  const store = loadStore();
  return store[phoneNumber];
}

/**
 * Store a Linq chat ID mapping for a phone number.
 */
export function writeChatStore(phoneNumber: string, chatId: string): void {
  const store = loadStore();
  store[phoneNumber] = chatId;
  saveStore(store);
}

/**
 * Remove a chat mapping.
 */
export function deleteChatStore(phoneNumber: string): void {
  const store = loadStore();
  delete store[phoneNumber];
  saveStore(store);
}

/**
 * Get all stored chat mappings.
 */
export function listChatStore(): Record<string, string> {
  return { ...loadStore() };
}

/**
 * Invalidate the in-memory cache (e.g., after restart).
 */
export function resetChatStoreCache(): void {
  cachedStore = null;
}
