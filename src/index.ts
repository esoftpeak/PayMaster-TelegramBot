import { env } from "./config/env";
import { createBot } from "./bot/bot";
import { verifySupabaseConnection } from "./db/supabase";
import { startStripeWebhookServer } from "./http/stripeWebhookServer";

async function main(): Promise<void> {
  const backend = await verifySupabaseConnection();
  if (!backend.ok) {
    console.error("Backend unavailable:", backend.error);
    process.exitCode = 1;
    return;
  }
  console.log("Backend connection verified.");

  startStripeWebhookServer();

  await createBot(env.telegramBotToken);
  console.log("PayMaster bot is running (polling).");
}

void main();