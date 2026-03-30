/**
 * Merchant configuration shape (JSON file or future DB row).
 * Extend as Stripe/Square fields are finalized.
 */
export type MerchantGateway = "stripe" | "square";

export type MerchantConfig = {
  id: string;
  displayName: string;
  gateway: MerchantGateway;
  /** Stripe: secret key; Square: not used — use accessToken instead */
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  /** Square: application id + access token */
  squareApplicationId?: string;
  squareAccessToken?: string;
};
