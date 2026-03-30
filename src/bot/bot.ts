import TelegramBot from "node-telegram-bot-api";
import { registerTelegramProfile } from "./content/profile";
import { registerHandlers } from "./handlers/register";

export async function createBot(token: string): Promise<TelegramBot> {
  // Do not start polling until handlers are registered; otherwise /start can be dropped.
  const bot = new TelegramBot(token, { polling: { autoStart: false } });
  try {
    await registerTelegramProfile(bot);
  } catch (err) {
    console.warn(
      "Could not register bot profile (description / commands). Bot will still run.",
      err,
    );
  }
  registerHandlers(bot);
  await bot.startPolling();
  return bot;
}
