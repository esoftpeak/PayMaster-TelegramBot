# PayMaster Telegram Bot

A **Telegram-based admin interface** for merchant operations on card acquirers. The bot runs alongside a Node.js backend that orchestrates **Stripe** and **Square** for card-on-file verification (zero-amount authorization) and direct charges, with **multi-merchant** configuration and **hot-reload** of merchant credentials without restarting the process.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Merchant accounts](#merchant-accounts)
- [Development](#development)
- [Security and compliance](#security-and-compliance)
- [Roadmap](#roadmap)

---

## Features

| Area | Description |
|------|-------------|
| **Card on file (zero-amount auth)** | Synthetic profile data (e.g. Faker) → Stripe Customer + `SetupIntent` (`usage: 'off_session'`) or Square Customer + card attachment. Persist `customer_id` and `payment_method_id` / card id; treat successful $0 authorization as verified. |
| **Direct charge** | Charge a fixed amount with currency and description: Stripe `PaymentIntent` with immediate confirmation; Square `CreatePayment`. |
| **Multi-merchant** | Each merchant is a separate configuration (JSON under `merchants/` or future DB row). The bot selects the active merchant context per operation. |
| **Runtime reload** | Adding or editing merchant files is picked up by a file watcher so the main loop does not require a manual restart. |
| **Gateway diagnostics** | Normalize and surface gateway details in Telegram: e.g. Stripe `cvc_check`, `decline_code`; Square `errors` from API responses. |

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Telegram       │     │  Node.js         │     │  Payment gateways        │
│  (admin UI)     │────▶│  Telegram bot +  │────▶│  Stripe / Square APIs    │
│                 │     │  domain services │     │                          │
└─────────────────┘     └────────┬─────────┘     └─────────────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Merchants       │
                        │  (JSON / DB)     │
                        └──────────────────┘
```

- **Telegram layer**: commands, callbacks, inline flows, and formatted replies (no card data typed in chat; use hosted fields / payment links as implemented per gateway).
- **Services**: gateway adapters (Stripe, Square), shared payment orchestration, and optional delays between steps.
- **Config**: environment for bot token and global settings; per-merchant keys for acquirers.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | Process entry: load config, start bot. |
| `src/config/` | Environment and application configuration. |
| `src/bot/` | Telegram client setup, handler registration, middleware. |
| `src/services/gateways/stripe/` | Stripe-specific API usage. |
| `src/services/gateways/square/` | Square-specific API usage. |
| `src/services/payment/` | Shared charge / link-card flows and response normalization. |
| `src/merchants/` | Loading, validation, and hot-reload of merchant definitions. |
| `src/types/` | Shared TypeScript types and DTOs. |
| `src/utils/` | Pure helpers (timing, formatting, id generation). |
| `merchants/` | **Data**: one JSON file per merchant (secrets excluded from VCS by default). |

This keeps **transport** (Telegram), **domain** (payments, merchants), and **integrations** (Stripe/Square) separated so you can test and extend each layer independently.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or pnpm/yarn)
- **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)
- **Stripe** and/or **Square** developer credentials (test mode first)

---

## Configuration

1. Copy `.env.example` to `.env` in the project root and set values:

   | Variable | Description |
   |----------|-------------|
   | `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |

2. **Never** commit `.env` or live merchant JSON with secrets. Use test keys until production.

---

## Merchant accounts

### Stripe

1. [Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys)
2. Copy **Secret key** (`sk_...`) and **Publishable key** (`pk_...`).

### Square

1. [Developer Dashboard](https://developer.squareup.com/) → your application → **Credentials**
2. Copy **Application ID** and **Access token**.

### Adding a merchant

1. Add a JSON file under `merchants/` (see `merchants/merchant.example.json`).
2. On save, the loader should refresh the in-memory registry (implementation in `src/merchants/`).

For production, consider moving merchant storage to a **database** with encryption at rest for tokens (see discussion below).

---

## Development

```bash
npm install
npm run dev
```

The default `dev` script uses `nodemon` to restart on TypeScript changes. Merchant file hot-reload is separate from nodemon and is intended to refresh **without** restarting Node when only merchant JSON changes.

---

## Security and compliance

- **PCI**: Card numbers must not be collected or stored in Telegram messages or unsecured logs. Prefer **Stripe Elements** / **Square Web Payments SDK** or **Stripe Checkout** / **Square payment links** for PAN entry.
- **Secrets**: Restrict Telegram bot access (private bot, allowlisted chat IDs). Store `sk_` / Square tokens in env or a secrets manager, not in chat.
- **Audit**: Log merchant id, internal request id, and gateway ids—not full PAN.

---

## Roadmap

- [ ] Card-on-file flow (Stripe SetupIntent + Square card attach)
- [ ] Direct charge flow
- [ ] Merchant JSON schema + hot-reload watcher
- [ ] Normalized gateway response messages in Telegram
- [ ] Optional persistence (SQLite/Postgres) for merchants and audit logs

---

## License

ISC (see `package.json`). Update as needed for your organization.
