import { randomUUID } from "crypto";
import { getLinkedCardById, updateLinkedCard } from "../../db/linkedCards";
import { getMerchantCredentialsById } from "../../db/merchants";
import { createSquareClient } from "./squareClient";

export async function completeSquareCardFromNonce(input: {
  merchantId: string;
  linkedCardId: string;
  nonce: string;
}): Promise<{ ok: true } | { ok: false; message: string; statusCode: number }> {
  const nonce = input.nonce.trim();
  if (nonce.length === 0) {
    return { ok: false, message: "Missing card nonce.", statusCode: 400 };
  }

  const merchant = await getMerchantCredentialsById(input.merchantId);
  if (merchant === null || merchant.gateway !== "square") {
    return { ok: false, message: "Merchant not found.", statusCode: 404 };
  }

  const linked = await getLinkedCardById(input.linkedCardId);
  if (linked === null || linked.merchant_id !== merchant.id) {
    return { ok: false, message: "Linked card record not found.", statusCode: 404 };
  }

  if (linked.auth_status === "verified") {
    return { ok: true };
  }

  const client = createSquareClient(merchant);
  const cardRes = await client.cards.create({
    idempotencyKey: randomUUID(),
    sourceId: nonce,
    card: {
      customerId: linked.gateway_customer_id,
    },
  });

  if (cardRes.errors !== undefined && cardRes.errors.length > 0) {
    await updateLinkedCard(linked.id, {
      auth_status: "failed",
      decline_code: cardRes.errors[0]?.code ?? null,
      gateway_metadata: {
        ...linked.gateway_metadata,
        square_errors: cardRes.errors,
        completed_via: "square.cards.create_failed",
      },
    });
    return {
      ok: false,
      message: cardRes.errors.map((e) => e.detail ?? e.code ?? "error").join("; "),
      statusCode: 400,
    };
  }

  const cardId = cardRes.card?.id;
  if (cardId === undefined || cardId.length === 0) {
    return { ok: false, message: "Square did not return a card id.", statusCode: 502 };
  }

  await updateLinkedCard(linked.id, {
    gateway_payment_method_id: cardId,
    auth_status: "verified",
    cvc_check: null,
    decline_code: null,
    gateway_metadata: {
      ...linked.gateway_metadata,
      square_card: {
        last4: cardRes.card?.last4,
        cardBrand: cardRes.card?.cardBrand,
      },
      completed_via: "square.cards.create",
    },
  });

  return { ok: true };
}
