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
} as const;
