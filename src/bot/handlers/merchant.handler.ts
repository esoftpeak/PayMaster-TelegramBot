import TelegramBot, { Message } from "node-telegram-bot-api";
import {
  canManageBotAdmins,
  canViewAdminPanel,
  resolveTelegramAdminAuth,
} from "../auth/telegramAdmin";
import { insertMerchant, listActiveMerchants } from "../../db/merchants";
import type { MerchantGateway } from "../../db/merchants";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(slug);
}

type ParsedMerchantCommand =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "add"; slug: string; displayName: string; gateway: MerchantGateway }
  | { kind: "error"; message: string };

function parseMerchantRest(rest: string): ParsedMerchantCommand {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { kind: "help" };
  }
  const cmd = parts[0].toLowerCase();
  if (cmd === "help" || cmd === "?") {
    return { kind: "help" };
  }
  if (cmd === "list" || cmd === "ls") {
    return { kind: "list" };
  }
  if (cmd === "add") {
    if (parts.length < 4) {
      return {
        kind: "error",
        message:
          "Need a few pieces: short id, display name, and <code>stripe</code> or <code>square</code>. Example: <code>/merchant add acme_cafe Acme Cafe stripe</code>",
      };
    }
    const slug = parts[1];
    const gateway = parts[parts.length - 1].toLowerCase();
    const displayName = parts.slice(2, -1).join(" ");
    if (!isValidSlug(slug)) {
      return {
        kind: "error",
        message:
          "Slug must start with a letter or digit and contain only <code>a-z</code>, <code>0-9</code>, <code>_</code>, <code>-</code>.",
      };
    }
    if (gateway !== "stripe" && gateway !== "square") {
      return { kind: "error", message: "Gateway must be <code>stripe</code> or <code>square</code>." };
    }
    return { kind: "add", slug, displayName, gateway: gateway as MerchantGateway };
  }
  return { kind: "error", message: "Unknown subcommand. Try <code>/merchant help</code>." };
}

function buildMerchantHelpText(): string {
  return [
    "<b>Merchants</b>",
    "",
    "• <code>/merchant list</code> — who’s set up (names and gateways only; nothing sensitive)",
    "",
    "To <b>add</b> a merchant, you need a bot admin. They use a short command with the shop id, name, and Stripe or Square — ask your admin if you need a new one.",
    "",
    "To <b>work</b> with a merchant, open <b>Merchants</b> in the menu, tap a row, then use <b>Cards &amp; payments</b>.",
  ].join("\n");
}

async function handleMerchantCommand(bot: TelegramBot, msg: Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text ?? "";
  const rest = text.replace(/^\/merchant(?:@\w+)?\s*/i, "").trim();
  const parsed = parseMerchantRest(rest);

  if (parsed.kind === "error") {
    await bot.sendMessage(chatId, parsed.message, { parse_mode: "HTML" });
    return;
  }

  if (parsed.kind === "help") {
    await bot.sendMessage(chatId, buildMerchantHelpText(), { parse_mode: "HTML" });
    return;
  }

  const from = msg.from;
  if (from === undefined) {
    await bot.sendMessage(chatId, "Could not verify your Telegram user.");
    return;
  }

  const auth = await resolveTelegramAdminAuth(from.id);

  if (parsed.kind === "list") {
    if (!canViewAdminPanel(auth)) {
      await bot.sendMessage(
        chatId,
        "Operators only. Ask an admin to grant access with <code>/admin add</code>.",
        { parse_mode: "HTML" },
      );
      return;
    }
    try {
      const merchants = await listActiveMerchants();
      if (merchants.length === 0) {
        await bot.sendMessage(
          chatId,
          "No merchants yet. Ask a bot admin to add your first one.",
          { parse_mode: "HTML" },
        );
        return;
      }
      const lines = ["<b>Merchants</b>", ""];
      for (const m of merchants) {
        const cred = m.credentialsConfigured ? "ready" : "not connected yet";
        lines.push(
          `• <b>${escapeHtml(m.display_name)}</b> — ${escapeHtml(m.gateway)} (${escapeHtml(cred)})`,
        );
      }
      await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML" });
    } catch (err) {
      console.error("merchant list:", err);
      await bot.sendMessage(chatId, "Could not load merchants.");
    }
    return;
  }

  if (parsed.kind === "add") {
    if (!canManageBotAdmins(auth)) {
      await bot.sendMessage(
        chatId,
        "Only <b>bot admins</b> can add merchants. Ask an admin if you need a new one.",
        { parse_mode: "HTML" },
      );
      return;
    }
    try {
      const row = await insertMerchant({
        slug: parsed.slug,
        displayName: parsed.displayName,
        gateway: parsed.gateway,
      });
      await bot.sendMessage(
        chatId,
        [
          "Done — merchant added.",
          "",
          `<b>${escapeHtml(row.display_name)}</b> · ${escapeHtml(row.gateway)}`,
          "",
          "You can pick it under <b>Merchants</b> in the menu. Gateway setup (keys, etc.) happens outside this chat when your team is ready.",
        ].join("\n"),
        { parse_mode: "HTML" },
      );
    } catch (err) {
      console.error("merchant add:", err);
      await bot.sendMessage(
        chatId,
        "Couldn’t create that merchant. The short id might already be in use, or something went wrong on our side — try again or ask a developer.",
        { parse_mode: "HTML" },
      );
    }
  }
}

export function registerMerchantHandler(bot: TelegramBot): void {
  bot.onText(/^\/merchant(?:@\w+)?(?:\s|$)/i, (msg: Message) => {
    void handleMerchantCommand(bot, msg);
  });
}
