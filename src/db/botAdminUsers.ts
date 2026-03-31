import { getSupabaseClient } from "./supabase";

export type BotAdminRole = "admin" | "viewer";

export type BotAdminUser = {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  role: BotAdminRole;
  is_active: boolean;
  created_at: string;
};

function normalizeTelegramUserId(raw: string | number | bigint): string {
  return String(raw);
}

/**
 * `telegram_user_id` is int8 in Postgres. PostgREST matches int8 most reliably when the
 * filter value is a JSON number for ids within JS safe integer range.
 */
function telegramUserIdForColumn(
  raw: string | number | bigint,
): string | number {
  const s = normalizeTelegramUserId(raw);
  const n = Number(s);
  if (Number.isSafeInteger(n)) {
    return n;
  }
  return s;
}

export async function listActiveBotAdmins(): Promise<BotAdminUser[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("bot_admin_users")
    .select("id, telegram_user_id, telegram_username, role, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  return rows.map((row) => ({
    ...row,
    telegram_user_id: normalizeTelegramUserId(row.telegram_user_id as string | number | bigint),
    role: row.role as BotAdminRole,
  }));
}

function mapBotAdminRow(data: Record<string, unknown>): BotAdminUser {
  return {
    id: data.id as string,
    telegram_user_id: normalizeTelegramUserId(
      data.telegram_user_id as string | number | bigint,
    ),
    telegram_username: data.telegram_username as string | null,
    role: data.role as BotAdminRole,
    is_active: data.is_active as boolean,
    created_at: data.created_at as string,
  };
}

async function fetchBotAdminRowByTelegramIdFilter(
  idFilter: string | number,
): Promise<BotAdminUser | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("bot_admin_users")
    .select("id, telegram_user_id, telegram_username, role, is_active, created_at")
    .eq("telegram_user_id", idFilter)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }
  return mapBotAdminRow(data as Record<string, unknown>);
}

export async function getBotAdminByTelegramId(
  telegramUserId: string | number | bigint,
): Promise<BotAdminUser | null> {
  const idForCol = telegramUserIdForColumn(telegramUserId);
  const s = normalizeTelegramUserId(telegramUserId);

  let row = await fetchBotAdminRowByTelegramIdFilter(idForCol);
  if (row === null && typeof idForCol === "number") {
    row = await fetchBotAdminRowByTelegramIdFilter(s);
  }
  return row;
}

export async function upsertBotAdmin(input: {
  telegramUserId: string | number | bigint;
  telegramUsername?: string | null;
  role: BotAdminRole;
  isActive?: boolean;
}): Promise<BotAdminUser> {
  const supabase = getSupabaseClient();
  const telegram_user_id = telegramUserIdForColumn(input.telegramUserId);
  const payload = {
    telegram_user_id,
    telegram_username: input.telegramUsername ?? null,
    role: input.role,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await supabase
    .from("bot_admin_users")
    .upsert(payload, { onConflict: "telegram_user_id" })
    .select("id, telegram_user_id, telegram_username, role, is_active, created_at")
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }

  return {
    ...data,
    telegram_user_id: normalizeTelegramUserId(data.telegram_user_id as string | number | bigint),
    role: data.role as BotAdminRole,
  };
}

export async function setBotAdminActive(
  telegramUserId: string | number | bigint,
  isActive: boolean,
): Promise<BotAdminUser | null> {
  const supabase = getSupabaseClient();
  const idForCol = telegramUserIdForColumn(telegramUserId);

  const { data, error } = await supabase
    .from("bot_admin_users")
    .update({ is_active: isActive })
    .eq("telegram_user_id", idForCol)
    .select("id, telegram_user_id, telegram_username, role, is_active, created_at")
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }

  return {
    ...data,
    telegram_user_id: normalizeTelegramUserId(data.telegram_user_id as string | number | bigint),
    role: data.role as BotAdminRole,
  };
}

export async function updateBotAdminRole(
  telegramUserId: string | number | bigint,
  role: BotAdminRole,
): Promise<BotAdminUser | null> {
  const supabase = getSupabaseClient();
  const idForCol = telegramUserIdForColumn(telegramUserId);

  const { data, error } = await supabase
    .from("bot_admin_users")
    .update({ role })
    .eq("telegram_user_id", idForCol)
    .select("id, telegram_user_id, telegram_username, role, is_active, created_at")
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }

  return {
    ...data,
    telegram_user_id: normalizeTelegramUserId(data.telegram_user_id as string | number | bigint),
    role: data.role as BotAdminRole,
  };
}
