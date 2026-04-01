import { getSupabaseClient } from "./supabase";
import type { MerchantGateway } from "./merchants";

export type LinkedCardAuthStatus = "pending" | "verified" | "failed";

export type LinkedCardInsert = {
  merchantId: string;
  gateway: MerchantGateway;
  gatewayCustomerId: string;
  gatewayPaymentMethodId: string | null;
  stripeCheckoutSessionId?: string | null;
  authStatus: LinkedCardAuthStatus;
  authAmountCents: number;
  currency: string;
  cvcCheck: string | null;
  declineCode: string | null;
  gatewayMetadata: Record<string, unknown>;
};

export type LinkedCardRow = {
  id: string;
  merchant_id: string;
  gateway: MerchantGateway;
  gateway_customer_id: string;
  stripe_checkout_session_id: string | null;
  gateway_payment_method_id: string | null;
  auth_status: LinkedCardAuthStatus;
  auth_amount_cents: number;
  currency: string;
  cvc_check: string | null;
  decline_code: string | null;
  gateway_metadata: Record<string, unknown>;
};

export type LinkedCardPatch = {
  gateway_payment_method_id?: string | null;
  stripe_checkout_session_id?: string | null;
  auth_status?: LinkedCardAuthStatus;
  cvc_check?: string | null;
  decline_code?: string | null;
  gateway_metadata?: Record<string, unknown>;
};

export async function insertLinkedCard(row: LinkedCardInsert): Promise<{ id: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("linked_cards")
    .insert({
      merchant_id: row.merchantId,
      gateway: row.gateway,
      gateway_customer_id: row.gatewayCustomerId,
      gateway_payment_method_id: row.gatewayPaymentMethodId,
      stripe_checkout_session_id: row.stripeCheckoutSessionId ?? null,
      auth_status: row.authStatus,
      auth_amount_cents: row.authAmountCents,
      currency: row.currency,
      cvc_check: row.cvcCheck,
      decline_code: row.declineCode,
      gateway_metadata: row.gatewayMetadata,
    })
    .select("id")
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }
  return { id: (data as { id: string }).id };
}

function mapLinkedCardRow(row: Record<string, unknown>): LinkedCardRow {
  return {
    id: row.id as string,
    merchant_id: row.merchant_id as string,
    gateway: row.gateway as MerchantGateway,
    gateway_customer_id: row.gateway_customer_id as string,
    stripe_checkout_session_id: (row.stripe_checkout_session_id as string | null) ?? null,
    gateway_payment_method_id: (row.gateway_payment_method_id as string | null) ?? null,
    auth_status: row.auth_status as LinkedCardAuthStatus,
    auth_amount_cents: row.auth_amount_cents as number,
    currency: row.currency as string,
    cvc_check: (row.cvc_check as string | null) ?? null,
    decline_code: (row.decline_code as string | null) ?? null,
    gateway_metadata: (row.gateway_metadata as Record<string, unknown>) ?? {},
  };
}

const LINKED_CARD_ROW_SELECT =
  "id, merchant_id, gateway, gateway_customer_id, stripe_checkout_session_id, gateway_payment_method_id, auth_status, auth_amount_cents, currency, cvc_check, decline_code, gateway_metadata";

export async function getLinkedCardById(id: string): Promise<LinkedCardRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("linked_cards")
    .select(LINKED_CARD_ROW_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }
  return mapLinkedCardRow(data as Record<string, unknown>);
}

/** Latest verified Stripe card with a saved payment method (for off-session charges). */
export async function getLatestVerifiedStripeLinkedCard(merchantId: string): Promise<LinkedCardRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("linked_cards")
    .select(LINKED_CARD_ROW_SELECT)
    .eq("merchant_id", merchantId)
    .eq("gateway", "stripe")
    .eq("auth_status", "verified")
    .not("gateway_payment_method_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }
  return mapLinkedCardRow(data as Record<string, unknown>);
}

export async function updateLinkedCard(id: string, patch: LinkedCardPatch): Promise<void> {
  const supabase = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.gateway_payment_method_id !== undefined) {
    dbPatch.gateway_payment_method_id = patch.gateway_payment_method_id;
  }
  if (patch.stripe_checkout_session_id !== undefined) {
    dbPatch.stripe_checkout_session_id = patch.stripe_checkout_session_id;
  }
  if (patch.auth_status !== undefined) {
    dbPatch.auth_status = patch.auth_status;
  }
  if (patch.cvc_check !== undefined) {
    dbPatch.cvc_check = patch.cvc_check;
  }
  if (patch.decline_code !== undefined) {
    dbPatch.decline_code = patch.decline_code;
  }
  if (patch.gateway_metadata !== undefined) {
    dbPatch.gateway_metadata = patch.gateway_metadata;
  }

  const { error } = await supabase.from("linked_cards").update(dbPatch).eq("id", id);

  if (error !== null) {
    throw new Error(error.message);
  }
}
