import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  normalizeAccountId,
  normalizeE164,
  PAIRING_APPROVED_MESSAGE,
  registerPluginHttpRoute,
  resolveAckReaction,
  shouldAckReaction,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type ClawdbotConfig,
} from "clawdbot/plugin-sdk";

import { LinqConfigSchema, type LinqConfig, type ResolvedLinqAccount } from "./config.js";
import { getLinqRuntime } from "./runtime.js";
import { LinqClient } from "./api/client.js";
import { createLinqWebhookHandler } from "./inbound/webhook.js";
import { sendTextLinq, sendMediaLinq } from "./outbound/send.js";
import { startTypingLinq, stopTypingLinq, markReadLinq } from "./outbound/typing.js";
import { writeChatStore, resetChatStoreCache } from "./outbound/chat-store.js";
import type { ParsedInboundMessage } from "./inbound/events.js";

// ── Emoji → Linq Reaction Type ──

type LinqReactionType = "love" | "like" | "dislike" | "laugh" | "emphasize" | "question";

const EMOJI_TO_LINQ_REACTION: Record<string, LinqReactionType> = {
  "❤️": "love", "♥️": "love", "🩷": "love", "💕": "love", "😍": "love",
  "👍": "like", "👍🏻": "like", "👍🏼": "like", "👍🏽": "like", "👍🏾": "like", "👍🏿": "like",
  "👎": "dislike", "👎🏻": "dislike", "👎🏼": "dislike", "👎🏽": "dislike", "👎🏾": "dislike", "👎🏿": "dislike",
  "😂": "laugh", "🤣": "laugh", "😆": "laugh",
  "‼️": "emphasize", "❗": "emphasize", "❕": "emphasize", "⚡": "emphasize",
  "❓": "question", "❔": "question", "🤔": "question",
};

function emojiToLinqReaction(emoji: string): LinqReactionType | undefined {
  return EMOJI_TO_LINQ_REACTION[emoji];
}

// ── Account Resolution Helpers ──

function resolveLinqToken(cfg: ClawdbotConfig, accountId?: string): { token: string; source: "config" | "env" | "none" } {
  const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;
  const accountConfig = accountId && accountId !== DEFAULT_ACCOUNT_ID
    ? (linqConfig.accounts?.[accountId] as LinqConfig | undefined) ?? linqConfig
    : linqConfig;

  if (accountConfig.apiToken?.trim()) {
    return { token: accountConfig.apiToken.trim(), source: "config" };
  }

  const envToken = process.env.LINQ_API_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}

function resolveLinqAccount(cfg: ClawdbotConfig, accountId?: string): ResolvedLinqAccount {
  const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;
  const resolvedId = normalizeAccountId(accountId);

  const accountConfig = resolvedId !== DEFAULT_ACCOUNT_ID
    ? { ...linqConfig, ...(linqConfig.accounts?.[resolvedId] as LinqConfig | undefined ?? {}) }
    : linqConfig;

  const { token, source } = resolveLinqToken(cfg, resolvedId);
  const baseEnabled = linqConfig.enabled !== false;
  const accountEnabled = accountConfig.enabled !== false;

  return {
    accountId: resolvedId,
    enabled: baseEnabled && accountEnabled,
    name: accountConfig.name?.trim(),
    apiToken: token,
    tokenSource: source,
    fromNumber: accountConfig.fromNumber ?? "",
    config: accountConfig,
  };
}

function listLinqAccountIds(cfg: ClawdbotConfig): string[] {
  const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;
  const ids = new Set<string>();
  if (linqConfig.accounts && typeof linqConfig.accounts === "object") {
    for (const key of Object.keys(linqConfig.accounts)) {
      if (key) ids.add(normalizeAccountId(key));
    }
  }
  if (ids.size === 0) return [DEFAULT_ACCOUNT_ID];
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function resolveDefaultLinqAccountId(cfg: ClawdbotConfig): string {
  const ids = listLinqAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

// ── Runtime State ──

const runtimeState = new Map<string, Record<string, unknown>>();

function recordRuntimeState(accountId: string, state: Record<string, unknown>) {
  const existing = runtimeState.get(accountId) ?? {};
  runtimeState.set(accountId, { ...existing, ...state });
}

function getRuntimeState(accountId: string) {
  return runtimeState.get(accountId);
}

// ── Channel Plugin ──

const meta = {
  label: "Linq",
  selectionLabel: "Linq (iMessage/RCS/SMS via API)",
  detailLabel: "Linq",
  docsPath: "/channels/linq",
  docsLabel: "linq",
  blurb: "iMessage, RCS, and SMS without a Mac — via Linq Partner API.",
  systemImage: "message.fill",
};

export const linqPlugin: ChannelPlugin<ResolvedLinqAccount> = {
  id: "linq",
  meta: {
    ...meta,
    aliases: ["linq", "imessage-cloud"],
  },
  pairing: {
    idLabel: "linqSenderId",
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveLinqAccount(cfg);
      if (!account.apiToken) throw new Error("Linq API token not configured");
      await sendTextLinq(id, PAIRING_APPROVED_MESSAGE, {
        apiToken: account.apiToken,
        fromNumber: account.fromNumber,
        preferredService: account.config.preferredService ?? "iMessage",
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.linq"] },
  configSchema: buildChannelConfigSchema(LinqConfigSchema),
  config: {
    listAccountIds: (cfg) => listLinqAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveLinqAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultLinqAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "linq",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "linq",
        accountId,
        clearBaseFields: ["apiToken", "tokenFile", "fromNumber", "webhookSecret", "name"],
      }),
    isConfigured: (account) => Boolean(account.apiToken?.trim() && account.fromNumber?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiToken?.trim() && account.fromNumber?.trim()),
      tokenSource: account.tokenSource,
      fromNumber: account.fromNumber,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveLinqAccount(cfg, accountId).config.allowFrom ?? []).map(String),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((e) => String(e).trim()).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;
      const useAccountPath = Boolean(linqConfig.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.linq.accounts.${resolvedAccountId}.`
        : "channels.linq.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("linq"),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy =
        (cfg.channels?.defaults as { groupPolicy?: string } | undefined)?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Linq groups: groupPolicy="open" allows any member to trigger. Set channels.linq.groupPolicy="allowlist" to restrict.`,
      ];
    },
  },
  messaging: {
    normalizeTarget: (target) => {
      const trimmed = target.trim();
      if (!trimmed) return null;
      // Strip linq: prefix
      const cleaned = trimmed.replace(/^linq:/i, "");
      // Normalize to E.164 if it looks like a phone number
      const normalized = normalizeE164(cleaned);
      return normalized ?? cleaned;
    },
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw?.trim();
        if (!trimmed) return false;
        // Phone number (E.164) or linq:prefix
        return /^\+?\d{10,15}$/.test(trimmed) || /^linq:/i.test(trimmed);
      },
      hint: "+1XXXXXXXXXX",
    },
  },
  agentPrompt: {
    messageToolHints: () => [
      "You can react to messages using iMessage tapbacks via the react action (with the message tool). Available reaction types: love (❤️), like (👍), dislike (👎), laugh (😂), emphasize (‼️), question (❓).",
      "Use reactions naturally as part of conversation — the way a real person would in iMessage:",
      "- 👍 (like) when a simple acknowledgment is enough and no text reply is needed (e.g. \"sounds good\", \"ok got it\", \"will do\")",
      "- ❤️ (love) for heartfelt, kind, or appreciative messages",
      "- 😂 (laugh) for genuinely funny messages",
      "- ‼️ (emphasize) for important or exciting news",
      "- ❓ (question) when something is confusing or you need clarification",
      "You can react AND reply, or just react without a text reply when a tapback alone says it all. Don't overuse reactions — be selective and natural, like a real person texting.",
    ],
  },
  actions: {
    listActions: () => ["send", "react"],
    handleAction: async ({ action, params, cfg, accountId }: {
      action: string;
      params: Record<string, any>;
      cfg: ClawdbotConfig;
      accountId?: string;
    }) => {
      const account = resolveLinqAccount(cfg, accountId);
      if (!account.apiToken) throw new Error("Linq API token not configured");
      const client = new LinqClient({ apiToken: account.apiToken });

      if (action === "react") {
        const messageId = params.messageId as string;
        if (!messageId) throw new Error("messageId is required for react action");
        const emoji = (params.emoji as string)?.trim() ?? "❤️";
        const remove = params.remove === true;
        const reactionType = emojiToLinqReaction(emoji) ?? "love";

        if (remove) {
          await client.removeReaction(messageId, reactionType);
        } else {
          await client.addReaction(messageId, reactionType);
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ok: true, action: remove ? "removed" : "added", reaction: reactionType }) }],
        };
      }

      if (action === "send") {
        const to = (params.to as string)?.trim();
        if (!to) throw new Error("to is required for send action");
        const text = (params.message as string) ?? "";
        const mediaUrl = (params.media as string)?.trim();
        if (!text && !mediaUrl) throw new Error("message or media is required for send action");

        if (mediaUrl) {
          const result = await sendMediaLinq(to, mediaUrl, text || undefined, {
            apiToken: account.apiToken,
            fromNumber: account.fromNumber,
            preferredService: account.config.preferredService ?? "iMessage",
          });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...result }) }],
          };
        }
        const result = await sendTextLinq(to, text, {
          apiToken: account.apiToken,
          fromNumber: account.fromNumber,
          preferredService: account.config.preferredService ?? "iMessage",
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...result }) }],
        };
      }

      throw new Error(`Action ${action} is not supported for channel linq.`);
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const typedInput = input as {
        name?: string;
        apiToken?: string;
        fromNumber?: string;
        webhookSecret?: string;
      };
      const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            linq: {
              ...linqConfig,
              enabled: true,
              ...(typedInput.name ? { name: typedInput.name } : {}),
              ...(typedInput.apiToken ? { apiToken: typedInput.apiToken } : {}),
              ...(typedInput.fromNumber ? { fromNumber: typedInput.fromNumber } : {}),
              ...(typedInput.webhookSecret ? { webhookSecret: typedInput.webhookSecret } : {}),
            },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          linq: {
            ...linqConfig,
            enabled: true,
            accounts: {
              ...linqConfig.accounts,
              [accountId]: {
                ...(linqConfig.accounts?.[accountId] as Record<string, unknown> | undefined),
                enabled: true,
                ...(typedInput.name ? { name: typedInput.name } : {}),
                ...(typedInput.apiToken ? { apiToken: typedInput.apiToken } : {}),
                ...(typedInput.fromNumber ? { fromNumber: typedInput.fromNumber } : {}),
                ...(typedInput.webhookSecret ? { webhookSecret: typedInput.webhookSecret } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getLinqRuntime().channel.text.chunkText(text, limit),
    chunkerMode: "text",
    textChunkLimit: 10000,
    sendText: async ({ to, text, accountId, cfg }) => {
      if (!text?.trim()) return { channel: "linq", messageId: "", chatId: "" };
      const account = resolveLinqAccount(cfg!, accountId);
      if (!account.apiToken) throw new Error("Linq API token not configured");
      const result = await sendTextLinq(to, text, {
        apiToken: account.apiToken,
        fromNumber: account.fromNumber,
        preferredService: account.config.preferredService ?? "iMessage",
      });
      recordRuntimeState(account.accountId, { lastOutboundAt: Date.now() });
      return { channel: "linq", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const account = resolveLinqAccount(cfg!, accountId);
      if (!account.apiToken) throw new Error("Linq API token not configured");
      const result = await sendMediaLinq(to, mediaUrl, text || undefined, {
        apiToken: account.apiToken,
        fromNumber: account.fromNumber,
        preferredService: account.config.preferredService ?? "iMessage",
      });
      recordRuntimeState(account.accountId, { lastOutboundAt: Date.now() });
      return { channel: "linq", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts: any) => {
      if (!Array.isArray(accounts)) return [];
      return accounts.flatMap((account: any) => {
        const issues: Array<{ channel: string; accountId: string; kind: string; message: string }> = [];
        if (!account.configured) {
          issues.push({
            channel: "linq",
            accountId: account.accountId ?? "default",
            kind: "config",
            message: "Linq API token or fromNumber not configured",
          });
        }
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (lastError) {
          issues.push({
            channel: "linq",
            accountId: account.accountId ?? "default",
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          });
        }
        return issues;
      });
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      if (!account.apiToken) return { ok: false, error: "No API token" };
      const client = new LinqClient({ apiToken: account.apiToken });
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const result = await client.listChats(account.fromNumber);
        clearTimeout(timer);
        return { ok: true, chatCount: result.chats.length };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiToken?.trim() && account.fromNumber?.trim()),
      tokenSource: account.tokenSource,
      fromNumber: account.fromNumber,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      mode: "webhook",
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const apiToken = account.apiToken?.trim();
      const fromNumber = account.fromNumber?.trim();
      const webhookSecret = account.config.webhookSecret?.trim();
      const webhookPath = account.config.webhookPath || "/__linq__/webhook";
      const resolvedAccountId = account.accountId;

      if (!apiToken) throw new Error("Linq API token not configured");
      if (!fromNumber) throw new Error("Linq fromNumber not configured");

      // Reset chat store cache on startup
      resetChatStoreCache();

      recordRuntimeState(resolvedAccountId, {
        running: true,
        lastStartAt: Date.now(),
      });

      // Probe API to verify credentials
      try {
        const client = new LinqClient({ apiToken });
        const result = await client.listChats(fromNumber);
        ctx.log?.info(`[${resolvedAccountId}] Linq connected (${result.chats.length} existing chats from ${fromNumber})`);
      } catch (err) {
        ctx.log?.warn?.(`[${resolvedAccountId}] Linq probe failed: ${String(err)}`);
      }

      // Build the inbound message handler
      const handleInboundMessage = async (msg: ParsedInboundMessage) => {
        recordRuntimeState(resolvedAccountId, { lastInboundAt: Date.now() });

        // Cache the chat mapping
        writeChatStore(msg.from, msg.chatId);

        const runtime = getLinqRuntime();
        const cfg = runtime.config.loadConfig();

        // Resolve routing
        const route = runtime.channel.routing.resolveAgentRoute({
          cfg,
          channel: "linq",
          accountId: resolvedAccountId,
          peer: { kind: "dm", id: msg.from },
        });

        // Download media attachments
        const allMedia: Array<{ path: string; contentType?: string }> = [];
        for (const attachment of msg.attachments) {
          try {
            const saved = await runtime.channel.media.fetchRemoteMedia({ url: attachment.url });
            const stored = await runtime.channel.media.saveMediaBuffer(
              saved.buffer,
              saved.contentType ?? attachment.mimeType,
              "inbound",
              10 * 1024 * 1024,
            );
            allMedia.push({ path: stored.path, contentType: stored.contentType });
          } catch (err) {
            ctx.log?.warn?.(`[${resolvedAccountId}] failed to download attachment: ${String(err)}`);
          }
        }

        // Build inbound envelope
        const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
          agentId: route.agentId,
        });
        const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
        const previousTimestamp = runtime.channel.session.readSessionUpdatedAt(
          storePath,
          route.sessionKey,
        );

        const rawBody = msg.text || (allMedia.length > 0 ? "<media:image>" : "");
        if (!rawBody) return;

        const body = runtime.channel.reply.formatInboundEnvelope({
          channel: "Linq",
          from: msg.from,
          timestamp: Date.now(),
          body: rawBody,
          chatType: "direct",
          sender: { id: msg.from },
          previousTimestamp,
          envelope: envelopeOptions,
        });

        const ctxPayload = runtime.channel.reply.finalizeInboundContext({
          Body: body,
          RawBody: rawBody,
          CommandBody: rawBody,
          From: `linq:${msg.from}`,
          To: `linq:${fromNumber}`,
          SessionKey: route.sessionKey,
          AccountId: route.accountId,
          ChatType: "direct" as const,
          ConversationLabel: msg.from,
          SenderId: msg.from,
          Provider: "linq",
          Surface: "linq",
          MessageSid: msg.messageId,
          Timestamp: Date.now(),
          MediaPath: allMedia[0]?.path ?? "",
          MediaType: allMedia[0]?.contentType,
          MediaUrl: allMedia[0]?.path ?? "",
          MediaPaths: allMedia.length > 0 ? allMedia.map((m) => m.path) : undefined,
          MediaUrls: allMedia.length > 0 ? allMedia.map((m) => m.path) : undefined,
          MediaTypes: allMedia.length > 0
            ? allMedia.map((m) => m.contentType).filter((t): t is string => Boolean(t))
            : undefined,
          OriginatingChannel: "linq",
          OriginatingTo: `linq:${msg.from}`,
        });

        void runtime.channel.session.recordSessionMetaFromInbound({
          storePath,
          sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
          ctx: ctxPayload,
        }).catch(() => {});

        // Mark as read
        void markReadLinq(msg.from, apiToken).catch(() => {});

        // Ack reaction (heart/like on the inbound message)
        const ackReactionEmoji = resolveAckReaction(cfg, route.agentId);
        const ackReactionScope = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg).ackReactionScope ?? "group-mentions";
        const doAckReaction = Boolean(ackReactionEmoji && shouldAckReaction({
          scope: ackReactionScope,
          isDirect: true,
          isGroup: false,
        }));
        if (doAckReaction && msg.messageId) {
          const linqReactionType = emojiToLinqReaction(ackReactionEmoji!);
          if (linqReactionType) {
            const ackClient = new LinqClient({ apiToken });
            void ackClient.addReaction(msg.messageId, linqReactionType).catch((err) => {
              ctx.log?.warn?.(`[${resolvedAccountId}] ack reaction failed: ${String(err)}`);
            });
          }
        }

        // Start typing indicator
        void startTypingLinq(msg.from, apiToken).catch(() => {});

        // Dispatch to auto-reply system
        try {
          const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg);
          await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
              responsePrefix: messagesConfig.responsePrefix,
              deliver: async (payload: { text?: string; mediaUrl?: string; mediaUrls?: string[] }) => {
                const text = payload.text ?? "";
                const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);

                if (text) {
                  await sendTextLinq(msg.from, text, {
                    apiToken,
                    fromNumber,
                    preferredService: account.config.preferredService ?? "iMessage",
                  });
                }

                for (const url of mediaUrls) {
                  await sendMediaLinq(msg.from, url, undefined, {
                    apiToken,
                    fromNumber,
                    preferredService: account.config.preferredService ?? "iMessage",
                  });
                }

                recordRuntimeState(resolvedAccountId, { lastOutboundAt: Date.now() });
              },
              onError: (err: unknown) => {
                ctx.log?.error?.(`[${resolvedAccountId}] reply delivery failed: ${String(err)}`);
              },
            },
            replyOptions: {},
          });
        } finally {
          // Stop typing indicator
          void stopTypingLinq(msg.from, apiToken).catch(() => {});
        }
      };

      // Register webhook HTTP handler
      const handler = createLinqWebhookHandler({
        webhookSecret: webhookSecret ?? "",
        onMessage: handleInboundMessage,
        onError: (err) => {
          ctx.log?.error?.(`[${resolvedAccountId}] webhook error: ${String(err)}`);
        },
        log: (msg) => {
          if (getLinqRuntime().logging.shouldLogVerbose()) {
            ctx.log?.debug?.(msg);
          }
        },
      });

      const unregisterHttp = registerPluginHttpRoute({
        path: webhookPath,
        pluginId: "linq",
        accountId: resolvedAccountId,
        log: (msg: string) => ctx.log?.info?.(msg),
        handler,
      });

      ctx.log?.info(`[${resolvedAccountId}] registered webhook at ${webhookPath}`);

      // Handle abort
      const stopHandler = () => {
        ctx.log?.info(`[${resolvedAccountId}] stopping Linq provider`);
        unregisterHttp();
        recordRuntimeState(resolvedAccountId, {
          running: false,
          lastStopAt: Date.now(),
        });
      };

      ctx.abortSignal?.addEventListener("abort", stopHandler);

      return {
        stop: () => {
          stopHandler();
          ctx.abortSignal?.removeEventListener("abort", stopHandler);
        },
      };
    },
    logoutAccount: async ({ accountId, cfg }) => {
      const nextCfg = { ...cfg } as ClawdbotConfig;
      const linqConfig = (cfg.channels?.linq ?? {}) as LinqConfig;
      const nextLinq = { ...linqConfig };
      let cleared = false;
      let changed = false;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        if (nextLinq.apiToken || nextLinq.tokenFile || nextLinq.webhookSecret) {
          delete nextLinq.apiToken;
          delete nextLinq.tokenFile;
          delete nextLinq.webhookSecret;
          cleared = true;
          changed = true;
        }
      }

      const accounts = nextLinq.accounts ? { ...nextLinq.accounts } : undefined;
      if (accounts && accountId in accounts) {
        const entry = accounts[accountId];
        if (entry && typeof entry === "object") {
          const nextEntry = { ...entry } as Record<string, unknown>;
          if ("apiToken" in nextEntry || "tokenFile" in nextEntry || "webhookSecret" in nextEntry) {
            cleared = true;
            delete nextEntry.apiToken;
            delete nextEntry.tokenFile;
            delete nextEntry.webhookSecret;
            changed = true;
          }
          if (Object.keys(nextEntry).length === 0) {
            delete accounts[accountId];
            changed = true;
          } else {
            accounts[accountId] = nextEntry;
          }
        }
      }

      if (accounts) {
        if (Object.keys(accounts).length === 0) {
          delete nextLinq.accounts;
          changed = true;
        } else {
          nextLinq.accounts = accounts;
        }
      }

      if (changed) {
        if (Object.keys(nextLinq).length > 0) {
          nextCfg.channels = { ...nextCfg.channels, linq: nextLinq };
        } else {
          const nextChannels = { ...nextCfg.channels } as Record<string, unknown>;
          delete nextChannels.linq;
          if (Object.keys(nextChannels).length > 0) {
            nextCfg.channels = nextChannels as typeof nextCfg.channels;
          } else {
            delete nextCfg.channels;
          }
        }
        await getLinqRuntime().config.writeConfigFile(nextCfg);
      }

      const resolved = resolveLinqAccount(changed ? nextCfg : cfg, accountId);
      const loggedOut = resolved.tokenSource === "none";

      return { cleared, loggedOut };
    },
  },
};
