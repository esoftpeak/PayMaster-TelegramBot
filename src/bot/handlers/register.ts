import TelegramBot from "node-telegram-bot-api";
import { registerStartHandler } from "./start.handler";

export function registerHandlers(bot: TelegramBot): void {
  registerStartHandler(bot);
}
