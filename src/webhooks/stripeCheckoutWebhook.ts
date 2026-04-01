import Stripe from "stripe";
import { getLinkedCardById, updateLinkedCard } from "../db/linkedCards";
import { getMerchantCredentialsById } from "../db/merchants";

function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

async function onCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  merchantIdFromPath: string,
): Promise<void> {
  if (session.mode !== "setup") {
    return;
  }
  if (session.metadata?.merchant_id !== merchantIdFromPath) {
    console.warn("stripe webhook: merchant_id metadata does not match URL");
    return;
  }
  const linkedCardId = session.metadata?.linked_card_id;
  if (linkedCardId === undefined || linkedCardId.length === 0) {
    console.warn("stripe webhook: missing linked_card_id in session metadata");
    return;
  }

  const setupIntentRef = session.setup_intent;
  const setupIntentId =
    typeof setupIntentRef === "string"
      ? setupIntentRef
      : setupIntentRef !== null && typeof setupIntentRef === "object" && "id" in setupIntentRef
        ? (setupIntentRef as Stripe.SetupIntent).id
        : null;

  if (setupIntentId === null) {
    console.warn("stripe webhook: session has no setup_intent");
    return;
  }

  const si = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });

  const pm = si.payment_method;
  const paymentMethodId = typeof pm === "string" ? pm : pm?.id ?? null;

  let cvcCheck: string | null = null;
  if (pm !== null && typeof pm !== "string" && pm.card?.checks?.cvc_check !== undefined) {
    cvcCheck = pm.card.checks.cvc_check;
  }

  const row = await getLinkedCardById(linkedCardId);
  if (row === null) {
    console.warn("stripe webhook: linked_card not found", linkedCardId);
    return;
  }

  const nextStatus = si.status === "succeeded" ? "verified" : si.status === "canceled" ? "failed" : "pending";

  await updateLinkedCard(linkedCardId, {
    gateway_payment_method_id: paymentMethodId,
    auth_status: nextStatus,
    cvc_check: cvcCheck,
    decline_code: si.last_setup_error?.decline_code ?? null,
    gateway_metadata: {
      ...row.gateway_metadata,
      setup_intent_id: si.id,
      setup_intent_status: si.status,
      completed_via: "checkout.session.completed",
      completed_at: new Date().toISOString(),
    },
  });
}

async function onCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
  merchantIdFromPath: string,
): Promise<void> {
  if (session.mode !== "setup") {
    return;
  }
  if (session.metadata?.merchant_id !== merchantIdFromPath) {
    return;
  }
  const linkedCardId = session.metadata?.linked_card_id;
  if (linkedCardId === undefined || linkedCardId.length === 0) {
    return;
  }
  const row = await getLinkedCardById(linkedCardId);
  if (row === null) {
    return;
  }
  if (row.auth_status === "verified") {
    return;
  }
  await updateLinkedCard(linkedCardId, {
    auth_status: "failed",
    gateway_metadata: {
      ...row.gateway_metadata,
      completed_via: "checkout.session.expired",
      expired_at: new Date().toISOString(),
    },
  });
}

export async function handleStripeWebhookRequest(input: {
  merchantId: string;
  rawBody: Buffer;
  signatureHeader: string | undefined;
}): Promise<{ status: number; body: string }> {
  if (input.signatureHeader === undefined || input.signatureHeader.length === 0) {
    return { status: 400, body: "Missing Stripe-Signature header" };
  }

  const merchant = await getMerchantCredentialsById(input.merchantId);
  if (merchant === null || merchant.gateway !== "stripe") {
    return { status: 404, body: "Merchant not found" };
  }

  const signingSecret = merchant.stripe_webhook_signing_secret;
  if (signingSecret === null || signingSecret.length === 0) {
    return { status: 503, body: "stripe_webhook_signing_secret is not set for this merchant" };
  }

  const apiKey = merchant.stripe_secret_key;
  if (apiKey === null || apiKey.length === 0) {
    return { status: 503, body: "Stripe secret key missing for this merchant" };
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(input.rawBody, input.signatureHeader, signingSecret);
  } catch {
    return { status: 400, body: "Invalid webhook signature" };
  }

  const stripe = stripeClient(apiKey);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutSessionCompleted(
          stripe,
          event.data.object as Stripe.Checkout.Session,
          input.merchantId,
        );
        break;
      case "checkout.session.expired":
        await onCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session, input.merchantId);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler:", err);
    return { status: 500, body: "Webhook handler error" };
  }

  return { status: 200, body: JSON.stringify({ received: true }) };
}
