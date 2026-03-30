import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw;
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
} as const;
