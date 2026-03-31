import type TelegramBot from "node-telegram-bot-api";
import type { BotAdminUser } from "../../db/botAdminUsers";
import { updateBotAdminUsername } from "../../db/botAdminUsers";

/**
 * Fills missing `telegram_username` via Telegram `getChat` (private chat id = user id),
 * then persists to the DB when found. Works only if the user has interacted with this
 * bot at least once; Telegram does not expose usernames by id otherwise.
 */
export async function resolveAndStoreTelegramUsername(
  bot: TelegramBot,
  admin: BotAdminUser,
): Promise<BotAdminUser> {
  if (admin.telegram_username !== null && admin.telegram_username.length > 0) {
    return admin;
  }
  const n = Number(admin.telegram_user_id);
  if (!Number.isSafeInteger(n)) {
    return admin;
  }
  try {
    const chat = await bot.getChat(n);
    if (chat.type !== "private") {
      return admin;
    }
    const uname =
      "username" in chat && typeof chat.username === "string" && chat.username.length > 0
        ? chat.username
        : null;
    if (uname === null) {
      return admin;
    }
    const updated = await updateBotAdminUsername(admin.telegram_user_id, uname);
    return updated ?? { ...admin, telegram_username: uname };
  } catch {
    return admin;
  }
}

export async function resolveAndStoreUsernamesForAdmins(
  bot: TelegramBot,
  admins: BotAdminUser[],
): Promise<BotAdminUser[]> {
  return Promise.all(admins.map((a) => resolveAndStoreTelegramUsername(bot, a)));
}
