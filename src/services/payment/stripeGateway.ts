import { faker } from "@faker-js/faker";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { env } from "../../config/env";
import { insertLinkedCard, updateLinkedCard } from "../../db/linkedCards";
import type { MerchantCredentialsRow } from "../../db/merchants";
import type { NormalizedPaymentResult } from "./types";

function buildStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

function publicBaseUrlNormalized(): string | undefined {
  const raw = env.publicBaseUrl;
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function verifyStripeCardSetup(input: {
  merchant: MerchantCredentialsRow;
}): Promise<NormalizedPaymentResult> {
  const { merchant } = input;
  const correlationId = randomUUID();
  const secretKey = merchant.stripe_secret_key;
  if (secretKey === null || secretKey.length === 0) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Stripe secret key is missing for this merchant.",
    };
  }

  const base = publicBaseUrlNormalized();
  if (base === undefined) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message:
        "Set PUBLIC_BASE_URL in .env to your public HTTPS base URL (no trailing slash), e.g. your ngrok URL, so Stripe Checkout can redirect after card entry.",
    };
  }

  const stripe = buildStripeClient(secretKey);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const email = faker.internet.email({ firstName, lastName }).toLowerCase();

  const customer = await stripe.customers.create({
    name: `${firstName} ${lastName}`,
    email,
    metadata: {
      source: "paymaster_telegram_bot",
      merchant_id: merchant.id,
      correlation_id: correlationId,
    },
  });

  const { id: linkedCardId } = await insertLinkedCard({
    merchantId: merchant.id,
    gateway: "stripe",
    gatewayCustomerId: customer.id,
    gatewayPaymentMethodId: null,
    stripeCheckoutSessionId: null,
    authStatus: "pending",
    authAmountCents: 0,
    currency: "usd",
    cvcCheck: null,
    declineCode: null,
    gatewayMetadata: {
      correlationId,
      flow: "stripe_checkout_setup",
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customer.id,
    payment_method_types: ["card"],
    success_url: `${base}/stripe/setup-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/stripe/setup-cancel`,
    metadata: {
      linked_card_id: linkedCardId,
      merchant_id: merchant.id,
      correlation_id: correlationId,
    },
  });

  if (session.url === null || session.url.length === 0) {
    return {
      ok: false,
      gateway: "stripe",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: { customerId: customer.id, linkedCardId },
      message: "Stripe did not return a Checkout URL. Check your Stripe account and API version.",
    };
  }

  await updateLinkedCard(linkedCardId, {
    stripe_checkout_session_id: session.id,
    gateway_metadata: {
      correlationId,
      flow: "stripe_checkout_setup",
      checkout_session_id: session.id,
      checkout_url: session.url,
    },
  });

  const webhookConfigured =
    merchant.stripe_webhook_signing_secret !== null && merchant.stripe_webhook_signing_secret.length > 0;

  return {
    ok: true,
    gateway: "stripe",
    operation: "verify_card",
    correlationId,
    merchantId: merchant.id,
    gatewayRefs: {
      customerId: customer.id,
      linkedCardId,
      paymentId: session.id,
    },
    message: webhookConfigured
      ? "Open the secure link to add your card. When Checkout finishes, your row updates to verified automatically."
      : "Open the secure link to add your card. Configure stripe_webhook_signing_secret on this merchant and a Stripe webhook so we can mark the card verified when Checkout completes.",
    payload: {
      checkout_url: session.url,
      checkout_session_id: session.id,
      linked_card_id: linkedCardId,
      publishable_key_configured: Boolean(
        merchant.stripe_publishable_key !== null && merchant.stripe_publishable_key.length > 0,
      ),
      webhook_endpoint: `${base}/webhooks/stripe/${merchant.id}`,
      webhook_secret_configured: webhookConfigured,
    },
  };
}
