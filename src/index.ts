import { env } from "./config/env";
import { createBot } from "./bot/bot";

createBot(env.telegramBotToken);
console.log("PayMaster bot is running (polling).");
