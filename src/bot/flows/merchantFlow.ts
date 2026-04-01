import type TelegramBot from "node-telegram-bot-api";
import type { CallbackQuery, InlineKeyboardMarkup } from "node-telegram-bot-api";
import { canViewAdminPanel, resolveTelegramAdminAuth } from "../auth/telegramAdmin";
import {
  listActiveMerchants,
  getMerchantById,
  type MerchantGateway,
  type MerchantPublic,
} from "../../db/merchants";
import { createGatewayPaymentService } from "../../services/payment";
import type { NormalizedPaymentResult } from "../../services/payment";
import {
  clearSelectedMerchant,
  getSelectedMerchantId,
  setSelectedMerchantId,
} from "../session/operatorSession";

const CALLBACK = {
  home: "pm:home",
  merchants: "pm:merchants",
  payments: "pm:payments",
  help: "pm:help",
} as const;

const paymentGateway = createGatewayPaymentService();

/** Auto-delete friendly charge success toast after this delay. */
const CHARGE_SUCCESS_TOAST_MS = 5000;

function friendlyChargeSuccessHtml(amountCents: number, currency: string, gateway: MerchantGateway): string {
  const code = currency.trim().toUpperCase() || "USD";
  let amountDisplay: string;
  try {
    amountDisplay = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amountCents / 100);
  } catch {
    amountDisplay = `${(amountCents / 100).toFixed(2)} ${code}`;
  }
  const via = gateway === "square" ? "Square" : "Stripe";
  return [
    "<b>Payment successful</b>",
    "",
    `We charged <b>${escapeHtml(amountDisplay)}</b> via <b>${escapeHtml(via)}</b>.`,
    "",
    `<i>This message will disappear in ${CHARGE_SUCCESS_TOAST_MS / 1000} seconds.</i>`,
  ].join("\n");
}

function currencyFromChargeResult(result: NormalizedPaymentResult): string {
  if (result.payload !== undefined) {
    const c = (result.payload as Record<string, unknown>).currency;
    if (typeof c === "string" && c.length > 0) {
      return c;
    }
  }
  return "usd";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export type FlowAction =
  | { kind: "selectMerchant"; merchantId: string }
  | { kind: "clearSelection" }
  | { kind: "verifyStub" }
  | { kind: "chargeStub"; amountCents: number };

export function parseFlowCallback(data: string): FlowAction | null {
  if (data.startsWith("pm:s:")) {
    const rest = data.slice(5);
    if (rest === "clear") {
      return { kind: "clearSelection" };
    }
    if (isUuid(rest)) {
      return { kind: "selectMerchant", merchantId: rest };
    }
    return null;
  }
  if (data === "pm:stub:v") {
    return { kind: "verifyStub" };
  }
  if (data.startsWith("pm:stub:c:")) {
    const cents = Number.parseInt(data.slice(10), 10);
    if (!Number.isFinite(cents) || cents < 0) {
      return null;
    }
    return { kind: "chargeStub", amountCents: cents };
  }
  return null;
}

export function buildMerchantsScreenHtml(
  merchants: MerchantPublic[],
  selectedId: string | undefined,
): string {
  const lines = [
    "<b>Merchants</b>",
    "",
    "Pick which business you’re working with for <b>verify</b> and <b>charge</b>. Payment credentials stay on the server — this chat never shows them.",
    "",
  ];
  if (merchants.length === 0) {
    lines.push("<i>No merchants yet.</i> Ask a bot admin to add your first one.");
  } else if (selectedId === undefined) {
    lines.push("<b>Selected</b>: <i>none</i> — pick a row below.");
  } else {
    const sel = merchants.find((m) => m.id === selectedId);
    if (sel === undefined) {
      lines.push("<b>Selected</b>: <i>stale selection</i> — choose again.");
    } else {
      const cred = sel.credentialsConfigured ? "connected" : "simulation only until gateway is set up";
      lines.push(
        `<b>Selected</b>: ${escapeHtml(sel.display_name)} (${sel.gateway}) — credentials: ${escapeHtml(cred)}`,
      );
    }
  }
  return lines.join("\n");
}

export function merchantsKeyboard(
  merchants: MerchantPublic[],
  selectedId: string | undefined,
): InlineKeyboardMarkup {
  const plainRows: { text: string; callback_data: string }[][] = merchants.map((m) => {
    const mark = selectedId === m.id ? "✓ " : "";
    const gw = m.gateway === "stripe" ? "Stripe" : "Square";
    const short = m.slug.length > 18 ? `${m.slug.slice(0, 16)}…` : m.slug;
    const label = `${mark}${m.display_name} · ${gw} (${short})`;
    return [{ text: label, callback_data: `pm:s:${m.id}` }];
  });

  plainRows.push([{ text: "Clear selection", callback_data: "pm:s:clear" }]);
  plainRows.push([
    { text: "Cards & payments", callback_data: CALLBACK.payments },
    { text: "Home", callback_data: CALLBACK.home },
  ]);
  return { inline_keyboard: plainRows };
}

export function buildPaymentsScreenHtml(selected: MerchantPublic | null): string {
  const lines = [
    "<b>Cards &amp; payments</b>",
    "",
    "Card and payment actions return normalized gateway results and save records for audit/testing.",
    "",
  ];
  if (selected === null) {
    lines.push("<b>Merchant</b>: <i>none selected</i>");
    lines.push("");
    lines.push("Open <b>Merchants</b> and pick a row first.");
  } else if (!selected.is_active) {
    lines.push(`<b>Merchant</b>: ${escapeHtml(selected.display_name)} <i>(inactive)</i>`);
    lines.push("");
    lines.push("This merchant is turned off. Choose an active one under <b>Merchants</b>.");
  } else {
    const cred = selected.credentialsConfigured ? "connected" : "simulation only until gateway is set up";
    lines.push(`<b>Merchant</b>: ${escapeHtml(selected.display_name)}`);
    lines.push(`<b>Gateway</b>: ${escapeHtml(selected.gateway)} — ${escapeHtml(cred)}`);
    lines.push("");
    if (selected.gateway === "stripe") {
      lines.push(
        "• <b>Verify card</b> — Stripe Checkout (setup); webhook completes verification.",
      );
      lines.push(
        "• <b>Charge</b> — real Stripe charge on the <b>latest verified</b> saved card (test vs live follows your API keys).",
      );
    } else {
      lines.push(
        "• <b>Verify card</b> — opens a hosted Square card form (Web Payments SDK); card is saved on the Square customer.",
      );
      lines.push(
        "• <b>Charge</b> — real Square payment on the <b>latest verified</b> saved card (sandbox vs production follows <code>SQUARE_ENVIRONMENT</code> and your keys).",
      );
    }
  }
  return lines.join("\n");
}

export function paymentsKeyboard(
  hasSelectedMerchant: boolean,
  gateway: MerchantGateway | undefined,
): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = [];
  if (hasSelectedMerchant) {
    rows.push([{ text: "Verify card", callback_data: "pm:stub:v" }]);
    const suffix = gateway === "square" ? " · Square" : gateway === "stripe" ? " · Stripe" : "";
    rows.push([
      { text: `Charge $5.00${suffix}`, callback_data: "pm:stub:c:500" },
      { text: `Charge $1.00${suffix}`, callback_data: "pm:stub:c:100" },
    ]);
  }
  rows.push([
    { text: "Merchants", callback_data: CALLBACK.merchants },
    { text: "Home", callback_data: CALLBACK.home },
  ]);
  return { inline_keyboard: rows };
}

function formatNormalizedResultHtml(result: NormalizedPaymentResult): string {
  const status = result.ok ? "OK" : "Failed";
  const refs = JSON.stringify(result.gatewayRefs, null, 2);
  let payloadForPre = "";
  let checkoutUrl: string | undefined;
  if (result.payload !== undefined) {
    const copy = { ...result.payload } as Record<string, unknown>;
    const url = copy.checkout_url;
    if (typeof url === "string" && url.length > 0) {
      checkoutUrl = url;
    }
    delete copy.checkout_url;
    if (Object.keys(copy).length > 0) {
      payloadForPre = JSON.stringify(copy, null, 2);
    }
  }

  const blocks = [
    `<b>${escapeHtml(status)}</b> · ${escapeHtml(result.operation)} · ${escapeHtml(result.gateway)}`,
    "",
    escapeHtml(result.message),
    "",
    "<b>Correlation</b>",
    `<code>${escapeHtml(result.correlationId)}</code>`,
    "",
    "<b>Gateway refs</b>",
    `<pre>${escapeHtml(refs)}</pre>`,
  ];
  if (checkoutUrl !== undefined && checkoutUrl.length > 0) {
    blocks.push(
      "",
      `<a href="${escapeHtmlAttr(checkoutUrl)}">Open secure card form (Stripe Checkout)</a>`,
    );
  }
  if (payloadForPre.length > 0) {
    blocks.push("", "<b>Payload</b>", `<pre>${escapeHtml(payloadForPre)}</pre>`);
  }
  return blocks.join("\n");
}

async function editOrSend(
  bot: TelegramBot,
  query: CallbackQuery,
  text: string,
  markup: InlineKeyboardMarkup,
): Promise<void> {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
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
}

export async function renderMerchantsScreen(
  bot: TelegramBot,
  query: CallbackQuery,
  options?: { skipAnswer?: boolean },
): Promise<void> {
  const from = query.from;
  if (from === undefined) {
    if (!options?.skipAnswer) {
      await bot.answerCallbackQuery(query.id);
    }
    return;
  }
  const auth = await resolveTelegramAdminAuth(from.id);
  if (!canViewAdminPanel(auth)) {
    await bot.answerCallbackQuery(query.id, {
      text: "Operators only. Ask an admin to grant access (/admin add).",
      show_alert: true,
    });
    return;
  }
  if (!options?.skipAnswer) {
    await bot.answerCallbackQuery(query.id);
  }
  try {
    const merchants = await listActiveMerchants();
    const selectedId = getSelectedMerchantId(from.id);
    const html = buildMerchantsScreenHtml(merchants, selectedId);
    const markup = merchantsKeyboard(merchants, selectedId);
    await editOrSend(bot, query, html, markup);
  } catch (err) {
    console.error("renderMerchantsScreen:", err);
    await bot.sendMessage(query.message!.chat.id, "Couldn’t load merchants. Try again in a moment.");
  }
}

export async function renderPaymentsScreen(
  bot: TelegramBot,
  query: CallbackQuery,
  options?: { skipAnswer?: boolean },
): Promise<void> {
  const from = query.from;
  if (from === undefined) {
    if (!options?.skipAnswer) {
      await bot.answerCallbackQuery(query.id);
    }
    return;
  }
  const auth = await resolveTelegramAdminAuth(from.id);
  if (!canViewAdminPanel(auth)) {
    await bot.answerCallbackQuery(query.id, {
      text: "Operators only. Ask an admin to grant access (/admin add).",
      show_alert: true,
    });
    return;
  }
  if (!options?.skipAnswer) {
    await bot.answerCallbackQuery(query.id);
  }
  try {
    const selectedId = getSelectedMerchantId(from.id);
    const selected =
      selectedId !== undefined ? await getMerchantById(selectedId) : null;
    const html = buildPaymentsScreenHtml(selected);
    const canAct = selected !== null && selected.is_active;
    const markup = paymentsKeyboard(canAct, selected?.gateway);
    await editOrSend(bot, query, html, markup);
  } catch (err) {
    console.error("renderPaymentsScreen:", err);
    await bot.sendMessage(query.message!.chat.id, "Couldn’t open that screen. Try again.");
  }
}

export async function handleFlowCallback(bot: TelegramBot, query: CallbackQuery, data: string): Promise<boolean> {
  const action = parseFlowCallback(data);
  if (action === null) {
    return false;
  }

  const from = query.from;
  if (from === undefined) {
    await bot.answerCallbackQuery(query.id);
    return true;
  }

  const auth = await resolveTelegramAdminAuth(from.id);
  if (!canViewAdminPanel(auth)) {
    await bot.answerCallbackQuery(query.id, {
      text: "Operators only.",
      show_alert: true,
    });
    return true;
  }

  const chatId = query.message!.chat.id;

  if (action.kind === "clearSelection") {
    clearSelectedMerchant(from.id);
    await bot.answerCallbackQuery(query.id);
    await renderMerchantsScreen(bot, query, { skipAnswer: true });
    return true;
  }

  if (action.kind === "selectMerchant") {
    setSelectedMerchantId(from.id, action.merchantId);
    await bot.answerCallbackQuery(query.id);
    await renderMerchantsScreen(bot, query, { skipAnswer: true });
    return true;
  }

  if (action.kind === "verifyStub" || action.kind === "chargeStub") {
    const selectedId = getSelectedMerchantId(from.id);
    if (selectedId === undefined) {
      await bot.answerCallbackQuery(query.id, {
        text: "Select a merchant under Merchants first.",
        show_alert: true,
      });
      return true;
    }

    await bot.answerCallbackQuery(query.id);

    let result: NormalizedPaymentResult;
    try {
      if (action.kind === "verifyStub") {
        result = await paymentGateway.verifyCard({ merchantId: selectedId });
      } else {
        result = await paymentGateway.charge({
          merchantId: selectedId,
          amountCents: action.amountCents,
          currency: "usd",
          description: `PayMaster charge ${(action.amountCents / 100).toFixed(2)} USD`,
        });
      }
    } catch (err) {
      console.error("stub gateway:", err);
      await bot.sendMessage(
        chatId,
        "<b>Something went wrong</b>\n\nThat action didn’t finish. Try again in a moment.",
        { parse_mode: "HTML" },
      );
      return true;
    }

    if (action.kind === "chargeStub" && result.ok && result.operation === "charge") {
      const currency = currencyFromChargeResult(result);
      const gw = result.gateway;
      const sent = await bot.sendMessage(
        chatId,
        friendlyChargeSuccessHtml(action.amountCents, currency, gw),
        {
          parse_mode: "HTML",
        },
      );
      setTimeout(() => {
        void bot.deleteMessage(chatId, sent.message_id).catch(() => undefined);
      }, CHARGE_SUCCESS_TOAST_MS);
    } else {
      await bot.sendMessage(chatId, formatNormalizedResultHtml(result), { parse_mode: "HTML" });
    }

    try {
      await renderPaymentsScreen(bot, query, { skipAnswer: true });
    } catch {
      // ignore edit errors after send
    }
    return true;
  }

  return false;
}
