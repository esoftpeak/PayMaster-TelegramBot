import TelegramBot, { Message } from "node-telegram-bot-api";
import dotenv from "dotenv";
dotenv.config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

console.log(`🤖 BOT is running. 🤖`);
bot.onText(/\/start/, (msg: Message) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Welcome!👍`);
});