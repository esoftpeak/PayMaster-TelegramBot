import TelegramBot, { Message } from "node-telegram-bot-api";

export function registerStartHandler(bot: TelegramBot): void {
  bot.onText(/\/start/, (msg: Message) => {
    const chatId = msg.chat.id;
    void bot.sendMessage(chatId, "Welcome! Use the menu when available.");
  });
}
