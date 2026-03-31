import TelegramBot, { Message } from "node-telegram-bot-api";
import { sendHomeMessage } from "../content/sendHome";
import { logNewUserStartIfFirst } from "../utils/logNewUserStart";

export function registerStartHandler(bot: TelegramBot): void {
  bot.onText(/\/start/, (msg: Message) => {
    void logNewUserStartIfFirst(msg.from);
    void sendHomeMessage(bot, msg.chat.id);
  });
}
