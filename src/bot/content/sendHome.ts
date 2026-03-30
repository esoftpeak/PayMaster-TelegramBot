import type TelegramBot from "node-telegram-bot-api";
import { buildScreenHtml, keyboardForScreen, mainMenuKeyboard } from "./home";

export async function sendHomeMessage(bot: TelegramBot, chatId: number): Promise<void> {
  await bot.sendMessage(chatId, buildScreenHtml("home"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(),
  });
}

export async function sendHelpMessage(bot: TelegramBot, chatId: number): Promise<void> {
  await bot.sendMessage(chatId, buildScreenHtml("help"), {
    parse_mode: "HTML",
    reply_markup: keyboardForScreen("help"),
  });
}
