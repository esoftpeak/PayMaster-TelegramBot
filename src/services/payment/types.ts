import type { MerchantGateway } from "../../db/merchants";

export type NormalizedPaymentOperation = "verify_card" | "charge";

/**
 * Single shape for bot messages, logging, and future real Stripe/Square responses.
 */
export type NormalizedPaymentResult = {
  ok: boolean;
  gateway: MerchantGateway;
  operation: NormalizedPaymentOperation;
  correlationId: string;
  merchantId: string;
  gatewayRefs: {
    customerId?: string;
    paymentMethodId?: string;
    paymentId?: string;
    linkedCardId?: string;
    transactionId?: string;
  };
  message: string;
  /** Optional structured payload for debugging (stub uses fixed demo JSON). */
  payload?: Record<string, unknown>;
};

export type GatewayPaymentService = {
  verifyCard(input: { merchantId: string }): Promise<NormalizedPaymentResult>;
  charge(input: {
    merchantId: string;
    amountCents: number;
    currency: string;
    description?: string;
  }): Promise<NormalizedPaymentResult>;
};
