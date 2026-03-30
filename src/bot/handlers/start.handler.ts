import TelegramBot, { Message } from "node-telegram-bot-api";
import { sendHomeMessage } from "../content/sendHome";

export function registerStartHandler(bot: TelegramBot): void {
  bot.onText(/\/start/, (msg: Message) => {
    void sendHomeMessage(bot, msg.chat.id);
  });
}
