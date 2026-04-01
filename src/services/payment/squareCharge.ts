import { randomUUID } from "crypto";
import type { Currency } from "square";
import { getLatestVerifiedSquareLinkedCard } from "../../db/linkedCards";
import { insertPaymentTransaction } from "../../db/paymentTransactions";
import type { MerchantCredentialsRow } from "../../db/merchants";
import type { PaymentTransactionStatus } from "../../db/paymentTransactions";
import type { NormalizedPaymentResult } from "./types";
import { createSquareClient, getDefaultSquareLocationId } from "./squareClient";

function mapPaymentStatus(status: string | undefined): PaymentTransactionStatus {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
      return "succeeded";
    case "FAILED":
    case "CANCELED":
      return "failed";
    case "PENDING":
      return "pending";
    default:
      return "failed";
  }
}

function squareErrorsJson(errors: { category?: string; code?: string; detail?: string }[] | undefined): unknown {
  return errors === undefined ? null : errors;
}

export async function chargeSquareWithSavedCard(input: {
  merchant: MerchantCredentialsRow;
  amountCents: number;
  currency: string;
  description?: string;
}): Promise<NormalizedPaymentResult> {
  const correlationId = randomUUID();
  const { merchant, amountCents, currency: rawCurrency, description } = input;

  if (merchant.square_access_token === null || merchant.square_access_token.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Square access token is missing for this merchant.",
    };
  }

  if (!Number.isInteger(amountCents) || amountCents < 1) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Amount must be a whole number of cents (at least 1).",
    };
  }

  const currency = rawCurrency.trim().toUpperCase();
  if (currency.length !== 3) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Currency must be a 3-letter ISO code (e.g. usd).",
    };
  }

  const linked = await getLatestVerifiedSquareLinkedCard(merchant.id);
  if (linked === null) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message:
        "No verified saved card for this merchant. Complete Verify card (Square card form) first, then try again.",
    };
  }

  const cardId = linked.gateway_payment_method_id;
  if (cardId === null || cardId.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: { linkedCardId: linked.id },
      message: "Saved card id is missing. Re-run Verify card.",
    };
  }

  const client = createSquareClient(merchant);
  const locationId = await getDefaultSquareLocationId(client);
  if (locationId === null) {
    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: { linkedCardId: linked.id },
      message: "Could not resolve a Square location. Check your Square account has at least one location.",
    };
  }

  const payRes = await client.payments.create({
    idempotencyKey: randomUUID(),
    sourceId: cardId,
    customerId: linked.gateway_customer_id,
    locationId,
    amountMoney: {
      amount: BigInt(amountCents),
      currency: currency as Currency,
    },
    note: description ?? undefined,
    autocomplete: true,
    referenceId: correlationId,
  });

  if (payRes.errors !== undefined && payRes.errors.length > 0) {
    const { id: transactionId } = await insertPaymentTransaction({
      merchantId: merchant.id,
      gateway: "square",
      amountCents,
      currency: currency.toLowerCase(),
      description: description ?? null,
      status: "failed",
      gatewayPaymentId: null,
      declineCode: payRes.errors[0]?.code ?? null,
      cvcCheck: null,
      squareErrors: squareErrorsJson(payRes.errors),
      gatewayRaw: { correlationId, square_errors: payRes.errors },
    });

    return {
      ok: false,
      gateway: "square",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: { linkedCardId: linked.id, transactionId },
      message: payRes.errors.map((e) => e.detail ?? e.code ?? "error").join("; "),
      payload: {
        square_errors: payRes.errors,
        transactionId,
      },
    };
  }

  const payment = payRes.payment;
  const payStatus = payment?.status;
  const txStatus = mapPaymentStatus(payStatus);
  const paymentId = payment?.id ?? null;

  const ok = payStatus === "COMPLETED" || payStatus === "APPROVED";

  const { id: transactionId } = await insertPaymentTransaction({
    merchantId: merchant.id,
    gateway: "square",
    amountCents,
    currency: currency.toLowerCase(),
    description: description ?? null,
    status: txStatus,
    gatewayPaymentId: paymentId,
    declineCode: null,
    cvcCheck: null,
    squareErrors: null,
    gatewayRaw: {
      correlationId,
      payment_id: paymentId,
      payment_status: payStatus,
    },
  });

  return {
    ok,
    gateway: "square",
    operation: "charge",
    correlationId,
    merchantId: merchant.id,
    gatewayRefs: {
      paymentId: paymentId ?? undefined,
      transactionId,
      linkedCardId: linked.id,
    },
    message: ok
      ? "Square payment created successfully."
      : `Square payment status: ${payStatus ?? "unknown"}.`,
    payload: {
      amount_cents: amountCents,
      currency: currency.toLowerCase(),
      payment_status: payStatus,
      transactionId,
    },
  };
}
