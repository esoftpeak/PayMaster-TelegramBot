import type { BotAdminRole, BotAdminUser } from "../../db/botAdminUsers";
import { getBotAdminByTelegramId } from "../../db/botAdminUsers";

export type TelegramAdminAuth = {
  /** Row in `bot_admin_users`, if present (check `is_active` via helpers). */
  dbUser: BotAdminUser | null;
};

/**
 * Resolves operator permissions from Supabase only (`bot_admin_users`).
 */
export async function resolveTelegramAdminAuth(
  telegramUserId: number,
): Promise<TelegramAdminAuth> {
  const dbUser = await getBotAdminByTelegramId(telegramUserId);
  return { dbUser };
}

/** Active operator: one row with `is_active = true`. */
export function isActiveOperator(auth: TelegramAdminAuth): boolean {
  if (auth.dbUser === null) {
    return false;
  }
  return auth.dbUser.is_active;
}

/** Can use `/admin list` and other read-only operator commands. */
export function canViewAdminPanel(auth: TelegramAdminAuth): boolean {
  return isActiveOperator(auth);
}

/** Can add/remove/change roles (role `admin` only; not `viewer`). */
export function canManageBotAdmins(auth: TelegramAdminAuth): boolean {
  const u = auth.dbUser;
  if (u === null || !u.is_active) {
    return false;
  }
  return u.role === "admin";
}

export function describeRole(role: BotAdminRole): string {
  return role === "admin" ? "admin (full)" : "viewer (read-only)";
}

/** Row exists but `is_active` is false — different message than missing row. */
export function isInactiveOperator(auth: TelegramAdminAuth): boolean {
  return auth.dbUser !== null && !auth.dbUser.is_active;
}
