import type { InlineKeyboardMarkup } from "node-telegram-bot-api";

export type MenuScreen = "home" | "merchants" | "payments" | "help";

const CALLBACK = {
  home: "pm:home",
  merchants: "pm:merchants",
  payments: "pm:payments",
  help: "pm:help",
} as const;

export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Merchants", callback_data: CALLBACK.merchants },
        { text: "Cards & payments", callback_data: CALLBACK.payments },
      ],
      [{ text: "Help", callback_data: CALLBACK.help }],
    ],
  };
}

export function backToHomeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "Back to home", callback_data: CALLBACK.home }]],
  };
}

export function parseMenuCallback(data: string): MenuScreen | null {
  switch (data) {
    case CALLBACK.home:
      return "home";
    case CALLBACK.merchants:
      return "merchants";
    case CALLBACK.payments:
      return "payments";
    case CALLBACK.help:
      return "help";
    default:
      return null;
  }
}

export function buildScreenHtml(screen: MenuScreen): string {
  switch (screen) {
    case "home":
      return [
        "<b>PayMaster</b>",
        "",
        "Operator console for <b>Stripe</b> and <b>Square</b>: merchants, card verification, and payments.",
        "",
        "Use the buttons below or the menu (☰).",
      ].join("\n");
    case "merchants":
      return [
        "<b>Merchants</b>",
        "",
        "Choose which business you are working with. The list loads when you open this screen.",
      ].join("\n");
    case "payments":
      return [
        "<b>Cards &amp; payments</b>",
        "",
        "Verify cards and process charges for the selected merchant. Full options appear after this screen loads.",
      ].join("\n");
    case "help":
      return [
        "<b>Help</b>",
        "",
        "Commands:",
        "• /start — Home",
        "• /menu — Main menu",
        "• /help — This screen",
        "• /admin — Operator accounts (list, add, remove)",
        "• /merchant — Merchants (list; admins add new ones)",
        "",
        "Operators: open <b>Merchants</b> to choose a business, then <b>Cards &amp; payments</b> for card verification and charges through your connected Stripe or Square account.",
        "",
        "Security: never send full card numbers in chat. Use the secure card flows provided by Stripe or Square.",
        "",
        "Support: contact your organization administrator.",
      ].join("\n");
  }
}

export function keyboardForScreen(screen: MenuScreen): InlineKeyboardMarkup {
  if (screen === "home") {
    return mainMenuKeyboard();
  }
  return backToHomeKeyboard();
}
