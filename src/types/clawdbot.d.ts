/**
 * Type declarations for clawdbot/plugin-sdk.
 *
 * These are derived from the runtime shapes in clawdbot's compiled JS.
 * Since clawdbot doesn't ship .d.ts files, we declare the subset we need.
 */
declare module "clawdbot/plugin-sdk" {
  import { z } from "zod";

  // ── Config ──

  export interface ClawdbotConfig {
    channels?: Record<string, any>;
    session?: { store?: any };
    [key: string]: any;
  }

  // ── Channel Plugin ──

  export interface ChannelPlugin<T = any> {
    id: string;
    meta: {
      label: string;
      blurb: string;
      docsPath: string;
      docsLabel?: string;
      systemImage?: string;
      quickstartAllowFrom?: boolean;
      aliases?: string[];
      showConfigured?: boolean;
      order?: number;
      selectionLabel?: string;
      detailLabel?: string;
      selectionDocsPrefix?: string;
      selectionDocsOmitLabel?: boolean;
      selectionExtras?: string[];
    };
    pairing?: {
      idLabel: string;
      normalizeAllowEntry?: (entry: string) => string;
      notifyApproval?: (ctx: { cfg: ClawdbotConfig; id: string }) => Promise<void>;
    };
    onboarding?: any;
    capabilities: {
      chatTypes: ("direct" | "group" | "channel" | "thread")[];
      reactions?: boolean;
      threads?: boolean;
      media?: boolean;
      nativeCommands?: boolean;
      blockStreaming?: boolean;
      polls?: boolean;
    };
    reload?: { configPrefixes: string[] };
    configSchema?: any;
    config: {
      listAccountIds: (cfg: ClawdbotConfig) => string[];
      resolveAccount: (cfg: ClawdbotConfig, accountId: string) => T;
      defaultAccountId: (cfg: ClawdbotConfig) => string;
      setAccountEnabled: (ctx: { cfg: ClawdbotConfig; accountId: string; enabled: boolean }) => ClawdbotConfig;
      deleteAccount: (ctx: { cfg: ClawdbotConfig; accountId: string }) => ClawdbotConfig;
      isConfigured: (account: T) => boolean;
      describeAccount: (account: T) => Record<string, any>;
      resolveAllowFrom: (ctx: { cfg: ClawdbotConfig; accountId: string }) => string[];
      formatAllowFrom: (ctx: { allowFrom: string[] }) => string[];
    };
    security?: {
      resolveDmPolicy?: (ctx: { cfg: ClawdbotConfig; accountId?: string; account: T }) => {
        policy: string;
        allowFrom: string[];
        policyPath?: string;
        allowFromPath?: string;
        approveHint?: string;
        normalizeEntry?: (raw: string) => string;
      };
      collectWarnings?: (ctx: { account: T; cfg: ClawdbotConfig }) => string[];
    };
    groups?: {
      resolveRequireMention?: (ctx: any) => boolean;
      resolveToolPolicy?: (cfg: ClawdbotConfig, accountId: string, groupId: string) => string | undefined;
    };
    threading?: any;
    messaging: {
      normalizeTarget: (target: string) => string | null;
      targetResolver: {
        looksLikeId: (raw: string) => boolean;
        hint: string;
      };
    };
    directory?: any;
    resolver?: any;
    actions?: any;
    setup?: {
      resolveAccountId?: (ctx: { accountId?: string }) => string;
      applyAccountName?: (ctx: { cfg: ClawdbotConfig; accountId: string; name?: string }) => ClawdbotConfig;
      validateInput?: (ctx: { accountId: string; input: any }) => string | null;
      applyAccountConfig?: (ctx: { cfg: ClawdbotConfig; accountId: string; input: any }) => ClawdbotConfig;
    };
    outbound?: {
      deliveryMode: "direct" | "buffered" | "coalesced";
      chunker?: ((text: string, limit: number) => string[]) | null;
      chunkerMode?: "plain" | "markdown" | "text";
      textChunkLimit?: number;
      sendText?: (ctx: {
        to: string;
        text: string;
        accountId?: string;
        cfg?: ClawdbotConfig;
        deps?: any;
        replyToId?: string;
        threadId?: string;
      }) => Promise<{ channel: string; [key: string]: any }>;
      sendMedia?: (ctx: {
        to: string;
        text: string;
        mediaUrl: string;
        accountId?: string;
        cfg?: ClawdbotConfig;
        deps?: any;
        replyToId?: string;
        threadId?: string;
      }) => Promise<{ channel: string; [key: string]: any }>;
      sendPayload?: (ctx: any) => Promise<{ channel: string; [key: string]: any }>;
    };
    status?: {
      defaultRuntime?: any;
      collectStatusIssues?: (ctx: any) => any;
      buildChannelSummary?: (ctx: any) => any;
      probeAccount?: (ctx: { account: T; timeoutMs: number }) => Promise<any>;
      auditAccount?: (ctx: any) => Promise<any>;
      buildAccountSnapshot?: (ctx: { account: T; cfg?: ClawdbotConfig; runtime?: any; probe?: any }) => any;
      resolveAccountState?: (ctx: any) => string;
    };
    gateway?: {
      startAccount?: (ctx: {
        account: T;
        cfg: ClawdbotConfig;
        runtime: PluginRuntime;
        abortSignal: AbortSignal;
        log?: any;
        setStatus?: (state: any) => void;
      }) => Promise<any>;
      logoutAccount?: (ctx: { accountId: string; cfg: ClawdbotConfig }) => Promise<any>;
    };
    streaming?: any;
    agentPrompt?: any;
  }

  // ── Plugin Runtime ──

  export interface PluginRuntime {
    version: string;
    config: {
      loadConfig(): ClawdbotConfig;
      writeConfigFile(cfg: ClawdbotConfig): Promise<void>;
    };
    system: {
      enqueueSystemEvent(event: any): void;
      [key: string]: any;
    };
    media: {
      loadWebMedia(url: string): Promise<any>;
      detectMime(buffer: Buffer): string | undefined;
      [key: string]: any;
    };
    channel: {
      text: {
        chunkText(text: string, limit: number): string[];
        chunkMarkdownText(text: string, limit: number): string[];
        chunkMarkdownTextWithMode(text: string, limit: number, mode: string): string[];
        resolveChunkMode(cfg: ClawdbotConfig, channel: string): string;
        resolveTextChunkLimit?(cfg: ClawdbotConfig, channel: string, accountId?: string, opts?: any): number;
        hasControlCommand(text: string, cfg: ClawdbotConfig): boolean;
        [key: string]: any;
      };
      reply: {
        dispatchReplyWithBufferedBlockDispatcher(ctx: any): Promise<any>;
        resolveEffectiveMessagesConfig(cfg: ClawdbotConfig, agentId?: string): any;
        formatInboundEnvelope(ctx: any): string;
        finalizeInboundContext(ctx: any): any;
        resolveEnvelopeFormatOptions(cfg: ClawdbotConfig): any;
        [key: string]: any;
      };
      routing: {
        resolveAgentRoute(ctx: {
          cfg: ClawdbotConfig;
          channel: string;
          accountId: string;
          peer: { kind: "dm" | "group" | "channel"; id: string };
        }): { sessionKey: string; accountId: string; agentId?: string; mainSessionKey?: string; [key: string]: any };
      };
      pairing: {
        buildPairingReply(ctx: { channel: string; idLine: string; code: string }): string;
        readAllowFromStore(channel: string): Promise<string[]>;
        upsertPairingRequest(ctx: { channel: string; id: string; meta?: { name?: string } }): Promise<{ code: string; created: boolean }>;
      };
      media: {
        fetchRemoteMedia(ctx: { url: string }): Promise<{ buffer: Buffer; contentType?: string }>;
        saveMediaBuffer(buffer: Uint8Array, contentType: string | undefined, direction: "inbound" | "outbound", maxBytes: number): Promise<{ path: string; contentType?: string }>;
      };
      session: {
        resolveStorePath(store: any, opts?: { agentId?: string }): string;
        readSessionUpdatedAt(path: string, sessionKey: string): number | null;
        recordSessionMetaFromInbound(ctx: any): Promise<void>;
        recordInboundSession(ctx: any): void;
        updateLastRoute(ctx: any): void;
      };
      activity: {
        record(ctx: any): void;
        get(ctx: any): any;
      };
      [key: string]: any;
    };
    logging: {
      shouldLogVerbose(): boolean;
      getChildLogger(bindings: string, opts?: any): any;
    };
    state: {
      resolveStateDir(cfg: ClawdbotConfig): string;
    };
    [key: string]: any;
  }

  // ── Plugin API ──

  export interface ClawdbotPluginApi {
    id: string;
    name: string;
    version: string;
    description: string;
    source: string;
    config: ClawdbotConfig;
    pluginConfig: any;
    runtime: PluginRuntime;
    logger: any;
    registerChannel(registration: { plugin: ChannelPlugin }): void;
    registerProvider(provider: any): void;
    registerTool(tool: any, opts?: any): void;
    registerHook(events: string | string[], handler: any, opts?: any): void;
    registerHttpHandler(handler: any): void;
    registerHttpRoute(params: { path: string; handler: any }): void;
    registerGatewayMethod(method: string, handler: any): void;
    registerCli(registrar: any, opts?: any): void;
    registerService(service: any): void;
    registerCommand(command: any): void;
    resolvePath(input: string): string;
    on(hookName: string, handler: any, opts?: any): void;
  }

  // ── Helpers ──

  export const DEFAULT_ACCOUNT_ID: string;
  export const PAIRING_APPROVED_MESSAGE: string;

  export function normalizeAccountId(accountId?: string | null): string;
  export function normalizeE164(input: string): string | null;
  export function buildChannelConfigSchema(schema: any): any;
  export function emptyPluginConfigSchema(): any;
  export function getChatChannelMeta(channel: string): any;
  export function formatPairingApproveHint(channel: string): string;

  export function setAccountEnabledInConfigSection(ctx: {
    cfg: ClawdbotConfig;
    sectionKey: string;
    accountId: string;
    enabled: boolean;
    allowTopLevel?: boolean;
  }): ClawdbotConfig;

  export function deleteAccountFromConfigSection(ctx: {
    cfg: ClawdbotConfig;
    sectionKey: string;
    accountId: string;
    clearBaseFields?: string[];
  }): ClawdbotConfig;

  export function registerPluginHttpRoute(params: {
    path: string;
    pluginId?: string;
    accountId?: string;
    source?: string;
    log?: (msg: string) => void;
    handler: (req: any, res: any) => Promise<void> | void;
    registry?: any;
    fallbackPath?: string;
  }): () => void;

  export function normalizePluginHttpPath(path?: string, fallback?: string): string | null;

  // ── Ack Reactions ──

  export function resolveAckReaction(cfg: ClawdbotConfig, agentId?: string): string | undefined;

  export function shouldAckReaction(params: {
    scope: string;
    isDirect: boolean;
    isGroup: boolean;
    isMentionableGroup?: boolean;
    requireMention?: boolean;
    canDetectMention?: boolean;
    effectiveWasMentioned?: boolean;
    shouldBypassMention?: boolean;
  }): boolean;

  // Config schemas
  export const IMessageConfigSchema: any;
  export const TelegramConfigSchema: any;
  export const DiscordConfigSchema: any;
  export const SlackConfigSchema: any;
  export const SignalConfigSchema: any;
  export const WhatsAppConfigSchema: any;
}
