import TelegramBot, { Message } from "node-telegram-bot-api";
import { sendHomeMessage, sendHelpMessage } from "../content/sendHome";

export function registerMenuCommandHandlers(bot: TelegramBot): void {
  bot.onText(/\/menu/, (msg: Message) => {
    void sendHomeMessage(bot, msg.chat.id);
  });

  bot.onText(/\/help/, (msg: Message) => {
    void sendHelpMessage(bot, msg.chat.id);
  });
}
