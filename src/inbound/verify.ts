import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify HMAC-SHA256 webhook signature from Linq.
 *
 * Expected headers:
 *   X-Webhook-Signature: <hex digest>  (raw hex, no prefix)
 *   X-Webhook-Timestamp: <unix epoch seconds>
 *
 * The signed payload is: `${timestamp}.${rawBody}`
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  signingSecret: string,
): VerifyResult {
  if (!signatureHeader || !timestampHeader) {
    return { valid: false, reason: "missing signature or timestamp header" };
  }

  // Replay protection
  const timestampSec = Number(timestampHeader);
  if (!Number.isFinite(timestampSec)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  const ageMs = Date.now() - timestampSec * 1000;
  if (ageMs > MAX_TIMESTAMP_AGE_MS) {
    return { valid: false, reason: "timestamp too old (replay protection)" };
  }
  if (ageMs < -MAX_TIMESTAMP_AGE_MS) {
    return { valid: false, reason: "timestamp in the future" };
  }

  // Compute expected signature
  const signedPayload = `${timestampHeader}.${rawBody}`;
  const expectedSig = createHmac("sha256", signingSecret)
    .update(signedPayload)
    .digest("hex");

  // Parse provided signature
  const providedSig = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  // Constant-time comparison
  try {
    const expected = Buffer.from(expectedSig, "hex");
    const provided = Buffer.from(providedSig, "hex");
    if (expected.length !== provided.length) {
      return { valid: false, reason: "signature length mismatch" };
    }
    if (!timingSafeEqual(expected, provided)) {
      return { valid: false, reason: "signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "malformed signature" };
  }

  return { valid: true };
}
