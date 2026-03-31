import { randomUUID } from "crypto";
import { insertLinkedCard } from "../../db/linkedCards";
import { getMerchantById } from "../../db/merchants";
import { insertPaymentTransaction } from "../../db/paymentTransactions";
import type { GatewayPaymentService, NormalizedPaymentResult } from "./types";

function baseStubPayload(
  gateway: "stripe" | "square",
  operation: NormalizedPaymentResult["operation"],
): Record<string, unknown> {
  return {
    mode: "stub",
    note: "Live gateway calls plug in here when your team finishes setup.",
    gateway,
    operation,
    demo: true,
  };
}

/**
 * Persists demo rows and returns a normalized result. Swap this class for real
 * Stripe/Square adapters behind the same `GatewayPaymentService` interface.
 */
export function createStubGatewayPaymentService(): GatewayPaymentService {
  return {
    async verifyCard(input: { merchantId: string }): Promise<NormalizedPaymentResult> {
      const merchant = await getMerchantById(input.merchantId);
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

      const correlationId = randomUUID();
      const customerId =
        merchant.gateway === "stripe" ? `cus_stub_${correlationId.slice(0, 8)}` : `SQ_CUST_${correlationId.slice(0, 8)}`;
      const pmId =
        merchant.gateway === "stripe" ? `pm_stub_${correlationId.slice(0, 8)}` : `ccof:stub_${correlationId.slice(0, 8)}`;

      const { id: linkedCardId } = await insertLinkedCard({
        merchantId: merchant.id,
        gateway: merchant.gateway,
        gatewayCustomerId: customerId,
        gatewayPaymentMethodId: pmId,
        authStatus: "verified",
        authAmountCents: 0,
        currency: "usd",
        cvcCheck: "pass",
        declineCode: null,
        gatewayMetadata: {
          stub: true,
          correlationId,
          ...baseStubPayload(merchant.gateway, "verify_card"),
        },
      });

      return {
        ok: true,
        gateway: merchant.gateway,
        operation: "verify_card",
        correlationId,
        merchantId: merchant.id,
        gatewayRefs: {
          customerId,
          paymentMethodId: pmId,
          linkedCardId,
        },
        message:
          merchant.gateway === "stripe"
            ? "Practice run: card verified (simulated — no real charge)."
            : "Practice run: card on file (simulated).",
        payload: {
          ...baseStubPayload(merchant.gateway, "verify_card"),
          customerId,
          paymentMethodId: pmId,
          linkedCardId,
        },
      };
    },

    async charge(input: {
      merchantId: string;
      amountCents: number;
      currency: string;
      description?: string;
    }): Promise<NormalizedPaymentResult> {
      const merchant = await getMerchantById(input.merchantId);
      if (merchant === null || !merchant.is_active) {
        return {
          ok: false,
          gateway: "stripe",
          operation: "charge",
          correlationId: randomUUID(),
          merchantId: input.merchantId,
          gatewayRefs: {},
          message: "That merchant isn’t available or is turned off.",
        };
      }

      const correlationId = randomUUID();
      const paymentId =
        merchant.gateway === "stripe" ? `pi_stub_${correlationId.slice(0, 12)}` : `stub_pay_${correlationId.slice(0, 12)}`;

      const { id: transactionId } = await insertPaymentTransaction({
        merchantId: merchant.id,
        gateway: merchant.gateway,
        amountCents: input.amountCents,
        currency: input.currency,
        description: input.description ?? null,
        status: "succeeded",
        gatewayPaymentId: paymentId,
        declineCode: null,
        cvcCheck: "pass",
        squareErrors: null,
        gatewayRaw: {
          stub: true,
          correlationId,
          ...baseStubPayload(merchant.gateway, "charge"),
        },
      });

      return {
        ok: true,
        gateway: merchant.gateway,
        operation: "charge",
        correlationId,
        merchantId: merchant.id,
        gatewayRefs: {
          paymentId,
          transactionId,
        },
        message:
          merchant.gateway === "stripe"
            ? "Practice run: charge recorded (simulated — no real money moved)."
            : "Practice run: payment recorded (simulated).",
        payload: {
          ...baseStubPayload(merchant.gateway, "charge"),
          amount_cents: input.amountCents,
          currency: input.currency,
          gateway_payment_id: paymentId,
          transactionId,
        },
      };
    },
  };
}
