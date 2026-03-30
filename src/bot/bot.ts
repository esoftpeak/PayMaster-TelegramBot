import TelegramBot from "node-telegram-bot-api";
import { registerHandlers } from "./handlers/register";

export function createBot(token: string): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });
  registerHandlers(bot);
  return bot;
}
