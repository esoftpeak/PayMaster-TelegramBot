import { randomUUID } from "crypto";
import { getMerchantCredentialsById } from "../../db/merchants";
import type { GatewayPaymentService, NormalizedPaymentResult } from "./types";
import { verifyStripeCardSetup } from "./stripeGateway";
import { chargeStripeWithSavedCard } from "./stripeCharge";
import { verifySquareCardSetup } from "./squareVerify";
import { chargeSquareWithSavedCard } from "./squareCharge";
import { createStubGatewayPaymentService } from "./gatewayStub";

const stub = createStubGatewayPaymentService();

export function createGatewayPaymentService(): GatewayPaymentService {
  return {
    async verifyCard(input: { merchantId: string }): Promise<NormalizedPaymentResult> {
      const merchant = await getMerchantCredentialsById(input.merchantId);
      if (merchant === null || !merchant.is_active) {
        return {
          ok: false,
          gateway: "stripe",
          operation: "verify_card",
          correlationId: randomUUID(),
          merchantId: input.merchantId,
          gatewayRefs: {},
          message: "That merchant isn’t available or is turned off.",
        };
      }

      if (merchant.gateway === "stripe") {
        return verifyStripeCardSetup({ merchant });
      }
      if (merchant.gateway === "square") {
        return verifySquareCardSetup({ merchant });
      }
      return stub.verifyCard(input);
    },

    async charge(input: {
      merchantId: string;
      amountCents: number;
      currency: string;
      description?: string;
    }): Promise<NormalizedPaymentResult> {
      const merchant = await getMerchantCredentialsById(input.merchantId);
      if (merchant === null || !merchant.is_active) {
        return {
          ok: false,
          gateway: merchant !== null ? merchant.gateway : "stripe",
          operation: "charge",
          correlationId: randomUUID(),
          merchantId: input.merchantId,
          gatewayRefs: {},
          message: "That merchant isn’t available or is turned off.",
        };
      }
      if (merchant.gateway === "stripe") {
        return chargeStripeWithSavedCard({
          merchant,
          amountCents: input.amountCents,
          currency: input.currency,
          description: input.description,
        });
      }
      if (merchant.gateway === "square") {
        return chargeSquareWithSavedCard({
          merchant,
          amountCents: input.amountCents,
          currency: input.currency,
          description: input.description,
        });
      }
      return stub.charge(input);
    },
  };
}
