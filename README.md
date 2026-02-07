# @clawdbot/linq

iMessage, RCS, and SMS channel for [clawdbot](https://github.com/openclaw/clawdbot) — powered by the [Linq Partner API](https://linqapp.com). No Mac required.

## Overview

This plugin connects clawdbot to iMessage, RCS, and SMS via Linq's cloud API. Messages are sent and received through a provisioned phone number, with inbound delivery via webhooks.

Features:

- Send and receive iMessage, RCS, and SMS
- Media attachments (images, files)
- iMessage tapback reactions (love, like, dislike, laugh, emphasize, question)
- Typing indicators and read receipts
- Multi-account support
- DM pairing and allowlist security policies

## Prerequisites

1. A **Linq Partner API** account and bearer token
2. A **provisioned phone number** (E.164 format, e.g. `+15551234567`)
3. A **public webhook URL** — clawdbot's gateway must be reachable from the internet (e.g. via ngrok, Cloudflare Tunnel, or a public server)

## Installation

### One-liner (recommended)

```bash
clawdbot plugins install github:nickvasilescu/clawdbot-channel-linq
```

This clones the repo, installs dependencies, auto-builds via the `prepare` script, and registers the plugin. Done.

### From npm (when published)

```bash
clawdbot plugins install @clawdbot/linq
```

### Manual (clone + link)

If you want to develop or customize the plugin locally:

```bash
git clone https://github.com/nickvasilescu/clawdbot-channel-linq.git
cd clawdbot-channel-linq
npm install && npm run build
```

Then either link it:

```bash
clawdbot plugins install --link /path/to/clawdbot-channel-linq
```

Or add the path manually to `~/.clawdbot/clawdbot.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/clawdbot-channel-linq"]
    }
  }
}
```

## Configuration

All config lives under `channels.linq` in `~/.clawdbot/clawdbot.json`:

```json
{
  "channels": {
    "linq": {
      "enabled": true,
      "apiToken": "your-linq-api-token",
      "fromNumber": "+15551234567",
      "webhookSecret": "secret-from-subscription",
      "preferredService": "iMessage"
    }
  }
}
```

### Config Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable the channel |
| `apiToken` | `string` | — | Linq Partner API bearer token |
| `tokenFile` | `string` | — | Path to file containing the API token (alternative to `apiToken`) |
| `fromNumber` | `string` | — | E.164 phone number to send from (e.g. `+15551234567`) |
| `webhookSecret` | `string` | — | HMAC signing secret from webhook subscription |
| `webhookPath` | `string` | `/__linq__/webhook` | HTTP path for the inbound webhook |
| `preferredService` | `"iMessage" \| "RCS" \| "SMS"` | `"iMessage"` | Preferred delivery service |
| `dmPolicy` | `"open" \| "pairing" \| "allowlist"` | `"pairing"` | Who can DM the bot |
| `groupPolicy` | `"open" \| "allowlist"` | `"allowlist"` | Who can trigger the bot in groups |
| `allowFrom` | `string[]` | — | Phone numbers allowed to DM (used with `dmPolicy: "allowlist"`) |
| `groupAllowFrom` | `string[]` | — | Phone numbers allowed in groups (used with `groupPolicy: "allowlist"`) |
| `name` | `string` | — | Display name for this account |
| `accounts` | `object` | — | Multi-account configuration (see below) |

The API token can also be set via the `LINQ_API_TOKEN` environment variable.

## Exposing Your Gateway (ngrok)

Linq delivers inbound messages via webhooks, so your clawdbot gateway must be reachable from the public internet. The easiest way to do this on a local machine is [ngrok](https://ngrok.com).

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# or download from https://ngrok.com/download
```

### 2. Authenticate

Sign up at [ngrok.com](https://dashboard.ngrok.com/signup) (free tier works), then:

```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

### 3. Start the tunnel

The clawdbot gateway runs on port 18789 by default:

```bash
ngrok http 18789
```

ngrok will print your public URL:

```
Forwarding  https://a1b2c3d4.ngrok-free.app -> http://localhost:18789
```

Your webhook endpoint is now:

```
https://a1b2c3d4.ngrok-free.app/__linq__/webhook
```

Use this URL when registering the webhook with Linq (next section).

### Notes

- **Free tier URLs change every restart.** If ngrok restarts, you'll need to re-register the webhook with the new URL. Consider an [ngrok static domain](https://ngrok.com/docs/guides/other-guides/how-to-set-up-a-custom-domain/) (free, one per account) to avoid this.
- **Alternatives:** If you have a public server or VPS, you can skip ngrok entirely — just point the webhook URL at your server's IP/domain on port 18789. Cloudflare Tunnel and Tailscale Funnel also work.
- **Keep ngrok running** alongside the clawdbot gateway. If the tunnel goes down, Linq can't deliver webhooks and inbound messages will be lost.

## Webhook Setup

Once your gateway is publicly reachable (see above), register a webhook subscription with Linq so it knows where to send inbound messages.

### Register the webhook with Linq

Using curl (replace the ngrok URL with yours):

```bash
curl -X POST https://api.linqapp.com/api/partner/v3/webhook-subscriptions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://a1b2c3d4.ngrok-free.app/__linq__/webhook",
    "subscribed_events": [
      "message.received",
      "message.delivered",
      "message.read",
      "message.failed",
      "reaction.added",
      "reaction.removed",
      "chat.typing_indicator.started",
      "chat.typing_indicator.stopped"
    ]
  }'
```

The response will look like:

```json
{
  "subscription": {
    "id": "sub_abc123",
    "target_url": "https://a1b2c3d4.ngrok-free.app/__linq__/webhook",
    "subscribed_events": ["message.received", "..."],
    "signing_secret": "your-signing-secret-from-response",
    "is_active": true,
    "created_at": "2026-01-15T00:00:00Z"
  },
  "trace_id": "..."
}
```

Copy the `signing_secret` value and add it to your config as `webhookSecret`. Your final `channels.linq` config should look like:

```json
{
  "channels": {
    "linq": {
      "enabled": true,
      "apiToken": "your-linq-api-token",
      "fromNumber": "+15551234567",
      "webhookSecret": "your-signing-secret-from-response",
      "preferredService": "iMessage",
      "dmPolicy": "open"
    }
  }
}
```

**Important:** The `webhookSecret` is required. Without it, all inbound webhook deliveries will be rejected with 401.

### Programmatic helper

The plugin exports a setup helper you can use from Node.js:

```ts
import { createLinqWebhookSubscription } from "@clawdbot/linq/dist/cli/setup.js";

const result = await createLinqWebhookSubscription(
  "your-api-token",
  "https://a1b2c3d4.ngrok-free.app/__linq__/webhook",
);
console.log("Signing secret:", result.signingSecret);
```

### Signature verification

Inbound webhooks are verified using HMAC-SHA256. Linq sends:

- `X-Webhook-Signature` — hex-encoded HMAC digest
- `X-Webhook-Timestamp` — Unix epoch seconds

The signed payload is `${timestamp}.${rawBody}`. Requests older than 5 minutes are rejected (replay protection).

**Important:** `webhookSecret` must be configured for inbound webhooks to work. Without it, all webhook deliveries will be rejected with 401.

### Start the gateway

With everything configured, start (or restart) the clawdbot gateway:

```bash
clawdbot gateway start
```

Verify the Linq channel is loaded:

```bash
clawdbot status
```

You should see the Linq channel listed as running. Send a test iMessage to your provisioned number — it should appear in clawdbot and trigger a reply.

## Multi-Account Support

To use multiple Linq accounts (e.g. different phone numbers for different agents):

```json
{
  "channels": {
    "linq": {
      "enabled": true,
      "accounts": {
        "personal": {
          "apiToken": "token-for-personal",
          "fromNumber": "+15551111111",
          "name": "Personal Line"
        },
        "business": {
          "apiToken": "token-for-business",
          "fromNumber": "+15552222222",
          "name": "Business Line",
          "preferredService": "RCS"
        }
      }
    }
  }
}
```

Each account gets its own webhook handler. Account-level settings override top-level defaults.

## Reactions

The plugin maps emoji to iMessage tapback types:

| Emoji | Tapback | Notes |
|-------|---------|-------|
| :heart: :two_hearts: :heart_eyes: | love | Heart tapback |
| :thumbsup: (all skin tones) | like | Thumbs up tapback |
| :thumbsdown: (all skin tones) | dislike | Thumbs down tapback |
| :joy: :rofl: :laughing: | laugh | Ha ha tapback |
| :bangbang: :exclamation: :zap: | emphasize | Exclamation tapback |
| :question: :thinking: | question | Question mark tapback |

Agents can react to messages using the `react` action with any of the above emoji. Reactions can also be removed.

## Troubleshooting

### "Linq API token not configured"

Set `channels.linq.apiToken` in your config, or export `LINQ_API_TOKEN` as an environment variable.

### "Linq fromNumber not configured"

Set `channels.linq.fromNumber` to your provisioned E.164 phone number.

### Webhook not receiving messages

1. Verify your gateway is publicly reachable at the webhook URL
2. Check that the webhook subscription is active: `GET https://api.linqapp.com/api/partner/v3/webhook-subscriptions` with your API token
3. Ensure `webhookPath` matches what you registered (default: `/__linq__/webhook`)
4. Check gateway logs for signature verification failures

### Messages not delivering

- Verify the recipient's number is in E.164 format (`+1XXXXXXXXXX`)
- Check `preferredService` — if set to `iMessage` but the recipient doesn't use iMessage, delivery may fail. Try `SMS` as fallback.
- Review Linq dashboard for delivery status and failure reasons

### Chat store issues

Chat ID mappings are cached at `~/.clawdbot/credentials/linq-chats.json`. If you encounter stale mappings, delete this file and restart the gateway — chats will be re-created on next send.

## Security Notes

- **API tokens** are sensitive credentials. Prefer `tokenFile` or the `LINQ_API_TOKEN` environment variable over putting tokens directly in config.
- **Webhook secrets** should always be configured in production to prevent spoofed inbound messages.
- **DM policy** defaults to `"pairing"` — unknown senders must be approved before they can interact with the bot. Set to `"allowlist"` and configure `allowFrom` for stricter control.
- **Group policy** defaults to `"allowlist"` — configure `groupAllowFrom` to control which numbers can trigger the bot in group chats.

## License

[MIT](LICENSE)
