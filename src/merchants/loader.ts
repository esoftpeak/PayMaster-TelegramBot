import type { MerchantConfig } from "./types";

/**
 * Loads merchant definitions from disk (and later may watch for changes).
 * Full implementation in a later step.
 */
export class MerchantRegistry {
  private merchants = new Map<string, MerchantConfig>();

  getAll(): MerchantConfig[] {
    return [...this.merchants.values()];
  }

  getById(id: string): MerchantConfig | undefined {
    return this.merchants.get(id);
  }
}
