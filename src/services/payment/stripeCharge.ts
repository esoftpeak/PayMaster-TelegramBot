import { randomUUID } from "crypto";
import Stripe from "stripe";
import { getLatestVerifiedStripeLinkedCard } from "../../db/linkedCards";
import { insertPaymentTransaction } from "../../db/paymentTransactions";
import type { MerchantCredentialsRow } from "../../db/merchants";
import type { PaymentTransactionStatus } from "../../db/paymentTransactions";
import type { NormalizedPaymentResult } from "./types";

function buildStripe(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

function mapIntentStatusToTxStatus(status: Stripe.PaymentIntent.Status): PaymentTransactionStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "requires_action":
    case "requires_confirmation":
      return "requires_action";
    case "processing":
    case "requires_capture":
      return "pending";
    case "canceled":
      return "canceled";
    case "requires_payment_method":
      return "failed";
    default:
      return "failed";
  }
}

function cvcCheckFromCharge(charge: Stripe.Charge | string | null): string | null {
  if (charge === null || typeof charge === "string") {
    return null;
  }
  const check = charge.payment_method_details?.card?.checks?.cvc_check;
  return check ?? null;
}

function chargeErrorMessage(err: unknown): string {
  if (err instanceof Stripe.errors.StripeCardError) {
    return err.message;
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Charge failed.";
}

function declineFromStripeError(err: unknown): string | null {
  if (err instanceof Stripe.errors.StripeCardError) {
    return err.decline_code ?? err.code ?? null;
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return err.code ?? null;
  }
  return null;
}

export async function chargeStripeWithSavedCard(input: {
  merchant: MerchantCredentialsRow;
  amountCents: number;
  currency: string;
  description?: string;
}): Promise<NormalizedPaymentResult> {
  const correlationId = randomUUID();
  const { merchant, amountCents, currency: rawCurrency, description } = input;

  const secretKey = merchant.stripe_secret_key;
  if (secretKey === null || secretKey.length === 0) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Stripe secret key is missing for this merchant.",
    };
  }

  if (!Number.isInteger(amountCents) || amountCents < 1) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Amount must be a whole number of cents (at least 1).",
    };
  }

  const currency = rawCurrency.trim().toLowerCase();
  if (currency.length !== 3) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Currency must be a 3-letter ISO code (e.g. usd).",
    };
  }

  const linked = await getLatestVerifiedStripeLinkedCard(merchant.id);
  if (linked === null) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message:
        "No verified saved card for this merchant. Use Verify card (Stripe Checkout) first, then try charging again.",
    };
  }

  const pmId = linked.gateway_payment_method_id;
  if (pmId === null || pmId.length === 0) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: { linkedCardId: linked.id },
      message: "Saved card is missing a payment method id. Re-run Verify card.",
    };
  }

  const stripe = buildStripe(secretKey);

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      customer: linked.gateway_customer_id,
      payment_method: pmId,
      description: description ?? undefined,
      confirm: true,
      off_session: true,
      payment_method_types: ["card"],
      metadata: {
        source: "paymaster_telegram_bot",
        merchant_id: merchant.id,
        correlation_id: correlationId,
        linked_card_id: linked.id,
      },
    });
  } catch (err) {
    const declineCode = declineFromStripeError(err);
    const { id: transactionId } = await insertPaymentTransaction({
      merchantId: merchant.id,
      gateway: "stripe",
      amountCents,
      currency,
      description: description ?? null,
      status: "failed",
      gatewayPaymentId: null,
      declineCode,
      cvcCheck: null,
      squareErrors: null,
      gatewayRaw: {
        correlationId,
        error_type: err instanceof Stripe.errors.StripeError ? err.type : "unknown",
        error_message: chargeErrorMessage(err),
      },
    });

    return {
      ok: false,
      gateway: "stripe",
      operation: "charge",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {
        linkedCardId: linked.id,
        transactionId,
      },
      message: chargeErrorMessage(err),
      payload: {
        decline_code: declineCode,
        cvc_check: null,
        transactionId,
      },
    };
  }

  const expanded = await stripe.paymentIntents.retrieve(pi.id, {
    expand: ["latest_charge"],
  });

  const txStatus = mapIntentStatusToTxStatus(expanded.status);
  const latestCharge = expanded.latest_charge;
  const cvcCheck = cvcCheckFromCharge(latestCharge);
  const declineCode =
    expanded.last_payment_error?.decline_code ??
    (expanded.last_payment_error?.code as string | undefined) ??
    null;

  const { id: transactionId } = await insertPaymentTransaction({
    merchantId: merchant.id,
    gateway: "stripe",
    amountCents,
    currency,
    description: description ?? null,
    status: txStatus,
    gatewayPaymentId: expanded.id,
    declineCode,
    cvcCheck,
    squareErrors: null,
    gatewayRaw: {
      correlationId,
      payment_intent_id: expanded.id,
      payment_intent_status: expanded.status,
      latest_charge_id: typeof latestCharge === "string" ? latestCharge : latestCharge?.id ?? null,
    },
  });

  const ok = expanded.status === "succeeded";
  let message: string;
  if (ok) {
    message = "Charge succeeded (Stripe PaymentIntent confirmed).";
  } else if (expanded.status === "requires_action") {
    message =
      "This charge needs extra authentication (e.g. 3D Secure). Off-session confirmation cannot finish in the bot — use an on-session flow or a non-3DS test card.";
  } else {
    message = `Charge did not succeed (status: ${expanded.status}).`;
  }

  return {
    ok,
    gateway: "stripe",
    operation: "charge",
    correlationId,
    merchantId: merchant.id,
    gatewayRefs: {
      paymentId: expanded.id,
      transactionId,
      linkedCardId: linked.id,
    },
    message,
    payload: {
      amount_cents: amountCents,
      currency,
      payment_intent_status: expanded.status,
      decline_code: declineCode,
      cvc_check: cvcCheck,
      transactionId,
    },
  };
}
