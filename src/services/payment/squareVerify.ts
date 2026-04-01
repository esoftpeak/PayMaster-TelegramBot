import { faker } from "@faker-js/faker";
import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { insertLinkedCard } from "../../db/linkedCards";
import type { MerchantCredentialsRow } from "../../db/merchants";
import { createSignedLinkToken } from "../../utils/signedLinkToken";
import type { NormalizedPaymentResult } from "./types";
import { createSquareClient } from "./squareClient";

export async function verifySquareCardSetup(input: {
  merchant: MerchantCredentialsRow;
}): Promise<NormalizedPaymentResult> {
  const { merchant } = input;
  const correlationId = randomUUID();

  if (merchant.square_access_token === null || merchant.square_access_token.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Square access token is missing for this merchant.",
    };
  }
  if (merchant.square_application_id === null || merchant.square_application_id.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Square application id is missing for this merchant.",
    };
  }

  const base = env.publicBaseUrl?.trim().replace(/\/+$/, "");
  if (base === undefined || base.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message:
        "Set PUBLIC_BASE_URL in .env to your public HTTPS base URL (no trailing slash), e.g. your ngrok URL, for the Square card form.",
    };
  }

  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const email = faker.internet.email({ firstName, lastName }).toLowerCase();

  const client = createSquareClient(merchant);
  const idem = randomUUID();
  const custRes = await client.customers.create({
    idempotencyKey: idem,
    givenName: firstName,
    familyName: lastName,
    emailAddress: email,
    referenceId: merchant.id,
    note: "paymaster_telegram_bot",
  });

  if (custRes.errors !== undefined && custRes.errors.length > 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: custRes.errors.map((e) => e.detail ?? e.code).join("; ") || "Square customer creation failed.",
      payload: { square_errors: custRes.errors },
    };
  }

  const customerId = custRes.customer?.id;
  if (customerId === undefined || customerId.length === 0) {
    return {
      ok: false,
      gateway: "square",
      operation: "verify_card",
      correlationId,
      merchantId: merchant.id,
      gatewayRefs: {},
      message: "Square did not return a customer id.",
    };
  }

  const { id: linkedCardId } = await insertLinkedCard({
    merchantId: merchant.id,
    gateway: "square",
    gatewayCustomerId: customerId,
    gatewayPaymentMethodId: null,
    stripeCheckoutSessionId: null,
    authStatus: "pending",
    authAmountCents: 0,
    currency: "usd",
    cvcCheck: null,
    declineCode: null,
    gatewayMetadata: {
      correlationId,
      flow: "square_web_payments_card",
    },
  });

  const linkToken = createSignedLinkToken({ merchantId: merchant.id, linkedCardId });
  const checkoutUrl = `${base}/square/save-card?token=${encodeURIComponent(linkToken)}`;

  return {
    ok: true,
    gateway: "square",
    operation: "verify_card",
    correlationId,
    merchantId: merchant.id,
    gatewayRefs: {
      customerId,
      linkedCardId,
    },
    message: "Open the secure link to enter your card. When you submit, we save the card on file in Square.",
    payload: {
      checkout_url: checkoutUrl,
      linked_card_id: linkedCardId,
    },
  };
}
