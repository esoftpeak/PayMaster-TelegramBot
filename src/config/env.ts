import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw;
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function httpPortFromEnv(): number {
  const raw = process.env.HTTP_PORT;
  if (raw === undefined || raw.trim().length === 0) {
    return 8787;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return 8787;
  }
  return n;
}

export const env = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  /** Project URL: https://xxxx.supabase.co */
  supabaseUrl: requireEnv("SUPABASE_URL"),
  /**
   * Service role key (secret). Required for server-side DB access with RLS bypass.
   * Never commit this value or expose it to clients.
   */
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  /**
   * Public HTTPS base URL (no trailing slash), e.g. https://abc123.ngrok.io
   * Used for Stripe Checkout success/cancel URLs and documented webhook paths.
   */
  publicBaseUrl: optionalEnv("PUBLIC_BASE_URL"),
  /** Port for the small HTTP server (webhooks + return pages). */
  httpPort: httpPortFromEnv(),
} as const;
