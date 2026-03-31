import TelegramBot, { Message } from "node-telegram-bot-api";
import {
  listActiveBotAdmins,
  setBotAdminActive,
  updateBotAdminRole,
  upsertBotAdmin,
  type BotAdminRole,
} from "../../db/botAdminUsers";
import {
  canManageBotAdmins,
  canViewAdminPanel,
  describeRole,
  isInactiveOperator,
  resolveTelegramAdminAuth,
} from "../auth/telegramAdmin";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type ParsedAdminCommand =
  | { kind: "help" }
  | { kind: "me" }
  | { kind: "list" }
  | { kind: "add"; telegramUserId: string; role: BotAdminRole }
  | { kind: "remove"; telegramUserId: string }
  | { kind: "role"; telegramUserId: string; role: BotAdminRole }
  | { kind: "error"; message: string };

function parseAdminRest(rest: string): ParsedAdminCommand {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { kind: "help" };
  }
  const cmd = parts[0].toLowerCase();
  if (cmd === "help" || cmd === "?") {
    return { kind: "help" };
  }
  if (cmd === "me" || cmd === "whoami") {
    return { kind: "me" };
  }
  if (cmd === "list" || cmd === "ls") {
    return { kind: "list" };
  }

  if (cmd === "add") {
    if (parts.length < 2) {
      return {
        kind: "error",
        message: "Usage: <code>/admin add &lt;telegram_user_id&gt; [admin|viewer]</code>",
      };
    }
    const id = parts[1];
    if (!/^\d+$/.test(id)) {
      return { kind: "error", message: "<code>telegram_user_id</code> must be digits only." };
    }
    let role: BotAdminRole = "admin";
    if (parts.length >= 3) {
      const r = parts[2].toLowerCase();
      if (r !== "admin" && r !== "viewer") {
        return { kind: "error", message: "Role must be <code>admin</code> or <code>viewer</code>." };
      }
      role = r;
    }
    return { kind: "add", telegramUserId: id, role };
  }

  if (cmd === "remove" || cmd === "deactivate" || cmd === "revoke") {
    if (parts.length < 2) {
      return {
        kind: "error",
        message: "Usage: <code>/admin remove &lt;telegram_user_id&gt;</code>",
      };
    }
    const id = parts[1];
    if (!/^\d+$/.test(id)) {
      return { kind: "error", message: "<code>telegram_user_id</code> must be digits only." };
    }
    return { kind: "remove", telegramUserId: id };
  }

  if (cmd === "role" || cmd === "promote" || cmd === "setrole") {
    if (parts.length < 3) {
      return {
        kind: "error",
        message: "Usage: <code>/admin role &lt;telegram_user_id&gt; &lt;admin|viewer&gt;</code>",
      };
    }
    const id = parts[1];
    if (!/^\d+$/.test(id)) {
      return { kind: "error", message: "<code>telegram_user_id</code> must be digits only." };
    }
    const r = parts[2].toLowerCase();
    if (r !== "admin" && r !== "viewer") {
      return { kind: "error", message: "Role must be <code>admin</code> or <code>viewer</code>." };
    }
    return { kind: "role", telegramUserId: id, role: r };
  }

  return { kind: "error", message: "Unknown subcommand. Try <code>/admin help</code>." };
}

function buildAdminHelpText(): string {
  return [
    "<b>Admin operators</b>",
    "",
    "<b>Everyone</b>",
    "• <code>/admin me</code> — your Telegram user id (share this with an admin to get access)",
    "",
    "<b>Operators</b> (active admin or viewer)",
    "• <code>/admin list</code> — list operators",
    "",
    "<b>Admins only</b>",
    "• <code>/admin add &lt;id&gt; [admin|viewer]</code> — grant access (default role: admin)",
    "• <code>/admin remove &lt;id&gt;</code> — deactivate (soft revoke)",
    "• <code>/admin role &lt;id&gt; &lt;admin|viewer&gt;</code> — change role",
    "",
    "<i>Viewers can list; only admins can add, remove, or change roles.</i>",
    "",
    "First-time setup: an admin adds operators with <code>/admin add</code> (your Telegram user id from <code>/admin me</code>).",
  ].join("\n");
}

async function handleAdminCommand(bot: TelegramBot, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text ?? "";
  const rest = text.replace(/^\/admin(?:@\w+)?\s*/i, "").trim();
  const parsed = parseAdminRest(rest);

  if (parsed.kind === "error") {
    await bot.sendMessage(chatId, parsed.message, { parse_mode: "HTML" });
    return;
  }

  if (parsed.kind === "me") {
    const from = msg.from;
    if (from === undefined) {
      await bot.sendMessage(chatId, "Could not read your Telegram user.");
      return;
    }
    const uname = from.username !== undefined ? `@${from.username}` : "(no username)";
    const lines = [
      "<b>Your Telegram identity</b>",
      "",
      `<b>User id</b> (use with <code>/admin add</code>): <code>${from.id}</code>`,
      `<b>Username</b>: ${escapeHtml(uname)}`,
    ];
    await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
    return;
  }

  const from = msg.from;
  if (from === undefined) {
    await bot.sendMessage(chatId, "Could not verify your Telegram user.");
    return;
  }

  const auth = await resolveTelegramAdminAuth(from.id);

  if (parsed.kind === "help") {
    await bot.sendMessage(chatId, buildAdminHelpText(), { parse_mode: "HTML" });
    return;
  }

  if (parsed.kind === "list") {
    if (!canViewAdminPanel(auth)) {
      const myId = `<code>${escapeHtml(String(from.id))}</code>`;
      let text: string;
      if (isInactiveOperator(auth)) {
        text = [
          "Your operator account is <b>inactive</b>, so access is denied.",
          "",
          `Your Telegram user id: ${myId}`,
          "",
          "Ask an admin to restore access or use <code>/admin add</code> again if you are an admin.",
        ].join("\n");
      } else {
        text = [
          "<b>Access denied</b>: you are not an active operator.",
          "",
          `Your Telegram user id: ${myId}`,
          "",
          "Ask an admin to grant access with <code>/admin add &lt;your id&gt;</code> (see id above).",
        ].join("\n");
      }
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
      return;
    }
    try {
      const admins = await listActiveBotAdmins();
      if (admins.length === 0) {
        await bot.sendMessage(
          chatId,
          "No active operators yet. Use <code>/admin add</code> once you have permission.",
          { parse_mode: "HTML" },
        );
        return;
      }
      const lines = ["<b>Active operators</b>", ""];
      for (const a of admins) {
        const handle =
          a.telegram_username !== null && a.telegram_username.length > 0
            ? `@${escapeHtml(a.telegram_username)}`
            : "—";
        lines.push(
          `• <code>${escapeHtml(a.telegram_user_id)}</code> ${handle} — ${escapeHtml(a.role)}`,
        );
      }
      await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
    } catch (err) {
      console.error("listActiveBotAdmins:", err);
      await bot.sendMessage(chatId, "Could not load operators. Please try again.");
    }
    return;
  }

  if (parsed.kind === "add" || parsed.kind === "remove" || parsed.kind === "role") {
    if (!canManageBotAdmins(auth)) {
      await bot.sendMessage(
        chatId,
        "You do not have permission to manage operators (need <b>admin</b> role).",
        { parse_mode: "HTML" },
      );
      return;
    }

    try {
      if (parsed.kind === "add") {
        const row = await upsertBotAdmin({
          telegramUserId: parsed.telegramUserId,
          telegramUsername: null,
          role: parsed.role,
          isActive: true,
        });
        await bot.sendMessage(
          chatId,
          [
            "Added or updated operator.",
            "",
            `<b>User id</b>: <code>${escapeHtml(row.telegram_user_id)}</code>`,
            `<b>Role</b>: ${escapeHtml(describeRole(row.role))}`,
          ].join("\n"),
          { parse_mode: "HTML" },
        );
        return;
      }

      if (parsed.kind === "remove") {
        const updated = await setBotAdminActive(parsed.telegramUserId, false);
        if (updated === null) {
          await bot.sendMessage(
            chatId,
            `No row found for user id <code>${escapeHtml(parsed.telegramUserId)}</code>.`,
            { parse_mode: "HTML" },
          );
          return;
        }
        await bot.sendMessage(
          chatId,
          `Operator <code>${escapeHtml(parsed.telegramUserId)}</code> deactivated.`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const updated = await updateBotAdminRole(parsed.telegramUserId, parsed.role);
      if (updated === null) {
        await bot.sendMessage(
          chatId,
          `No row found for user id <code>${escapeHtml(parsed.telegramUserId)}</code>.`,
          { parse_mode: "HTML" },
        );
        return;
      }
      await bot.sendMessage(
        chatId,
        [
          "Role updated.",
          "",
          `<b>User id</b>: <code>${escapeHtml(updated.telegram_user_id)}</code>`,
          `<b>Role</b>: ${escapeHtml(describeRole(updated.role))}`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
    } catch (err) {
      console.error("admin mutation:", err);
      await bot.sendMessage(chatId, "Operation failed. Please try again.");
    }
  }
}

export function registerAdminHandler(bot: TelegramBot): void {
  bot.onText(/^\/admin(?:@\w+)?(?:\s|$)/i, (msg: Message) => {
    void handleAdminCommand(bot, msg);
  });
}
