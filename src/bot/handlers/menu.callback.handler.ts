import TelegramBot from "node-telegram-bot-api";
import {
  buildScreenHtml,
  keyboardForScreen,
  parseMenuCallback,
} from "../content/home";

export function registerMenuCallbackHandler(bot: TelegramBot): void {
  bot.on("callback_query", (query) => {
    void (async () => {
      const data = query.data;
      if (data === undefined || query.message === undefined) {
        return;
      }

      const screen = parseMenuCallback(data);
      if (screen === null) {
        await bot.answerCallbackQuery(query.id);
        return;
      }

      await bot.answerCallbackQuery(query.id);

      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const text = buildScreenHtml(screen);
      const markup = keyboardForScreen(screen);

      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: markup,
        });
      } catch {
        await bot.sendMessage(chatId, text, {
          parse_mode: "HTML",
          reply_markup: markup,
        });
      }
    })();
  });
}
