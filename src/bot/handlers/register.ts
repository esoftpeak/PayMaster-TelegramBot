import TelegramBot from "node-telegram-bot-api";
import { registerAdminHandler } from "./admin.handler";
import { registerMenuCallbackHandler } from "./menu.callback.handler";
import { registerMenuCommandHandlers } from "./menu.command.handler";
import { registerStartHandler } from "./start.handler";

export function registerHandlers(bot: TelegramBot): void {
  registerStartHandler(bot);
  registerAdminHandler(bot);
  registerMenuCommandHandlers(bot);
  registerMenuCallbackHandler(bot);
}
