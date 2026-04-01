import type TelegramBot from "node-telegram-bot-api";

/** Methods on the live client; missing from @types/node-telegram-bot-api. */
type TelegramBotProfileMethods = {
  setMyDescription(form?: {
    description?: string;
    language_code?: string;
  }): Promise<boolean>;
  setMyShortDescription(form?: {
    short_description?: string;
    language_code?: string;
  }): Promise<boolean>;
};

/** Shown on the bot profile when shared (max 120 characters). */
export const BOT_SHORT_DESCRIPTION =
  "Operator console for Stripe and Square: merchants, card verification, and payments — in one chat.";

/**
 * Shown in the empty chat before the user taps Start ("What can this bot do?").
 * Max 512 characters — keep concise, like BotFather's intro.
 */
export const BOT_LONG_DESCRIPTION = [
  "PayMaster is your operator console for card payments.",
  "",
  "Verify cards for card-on-file use, process charges, and work with multiple merchant accounts on Stripe or Square.",
  "",
  "Tap Start to open the main menu. Use the ☰ menu for commands.",
  "",
].join("\n");

export async function registerTelegramProfile(bot: TelegramBot): Promise<void> {
  const api = bot as TelegramBot & TelegramBotProfileMethods;
  await api.setMyShortDescription({ short_description: BOT_SHORT_DESCRIPTION });
  await api.setMyDescription({ description: BOT_LONG_DESCRIPTION });
  await bot.setMyCommands([
    { command: "start", description: "Home — main menu" },
    { command: "menu", description: "Open the main menu" },
    { command: "help", description: "Help and information" },
    { command: "merchant", description: "Merchants — list; admins add accounts" },
    { command: "admin", description: "Manage operators (list, add, remove)" },
  ]);
}
