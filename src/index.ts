import { env } from "./config/env";
import { createBot } from "./bot/bot";
import { verifySupabaseConnection } from "./db/supabase";

async function main(): Promise<void> {
  const db = await verifySupabaseConnection();
  if (!db.ok) {
    console.error("Supabase connection failed:", db.error);
    process.exitCode = 1;
    return;
  }
  console.log("Supabase connection OK.");

  await createBot(env.telegramBotToken);
  console.log("PayMaster bot is running (polling).");
}

void main();