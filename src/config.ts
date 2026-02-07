import { z } from "zod";

export const LinqConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiToken: z.string().optional().describe("Linq Partner API bearer token"),
  tokenFile: z.string().optional().describe("Path to file containing API token"),
  fromNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/)
    .optional()
    .describe("E.164 phone number to send from"),
  webhookSecret: z
    .string()
    .optional()
    .describe("HMAC signing secret from webhook subscription"),
  webhookPath: z.string().default("/__linq__/webhook"),
  preferredService: z
    .enum(["iMessage", "RCS", "SMS"])
    .default("iMessage")
    .describe("Preferred delivery service"),
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
  groupPolicy: z.enum(["open", "allowlist"]).optional(),
  allowFrom: z.array(z.string()).optional(),
  groupAllowFrom: z.array(z.string()).optional(),
  name: z.string().optional(),
  accounts: z.record(z.string(), z.any()).optional(),
});

export type LinqConfig = z.infer<typeof LinqConfigSchema>;

export interface ResolvedLinqAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  apiToken: string;
  tokenSource: "config" | "file" | "env" | "none";
  fromNumber: string;
  config: LinqConfig;
}
