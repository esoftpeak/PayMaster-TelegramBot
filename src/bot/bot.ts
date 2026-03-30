import TelegramBot from "node-telegram-bot-api";
import { registerTelegramProfile } from "./content/profile";
import { registerHandlers } from "./handlers/register";

export async function createBot(token: string): Promise<TelegramBot> {
  const bot = new TelegramBot(token, { polling: true });
  try {
    await registerTelegramProfile(bot);
  } catch (err) {
    console.warn(
      "Could not register bot profile (description / commands). Bot will still run.",
      err,
    );
  }
  registerHandlers(bot);
  return bot;
}
