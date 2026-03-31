/**
 * In-memory selection of merchant per Telegram user (private chat).
 * Replace with Redis or DB if you need persistence across restarts or multiple instances.
 */
const selectedMerchantByTelegramUserId = new Map<number, string>();

export function getSelectedMerchantId(telegramUserId: number): string | undefined {
  return selectedMerchantByTelegramUserId.get(telegramUserId);
}

export function setSelectedMerchantId(telegramUserId: number, merchantId: string): void {
  selectedMerchantByTelegramUserId.set(telegramUserId, merchantId);
}

export function clearSelectedMerchant(telegramUserId: number): void {
  selectedMerchantByTelegramUserId.delete(telegramUserId);
}
