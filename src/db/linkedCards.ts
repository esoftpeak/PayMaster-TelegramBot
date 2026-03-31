import { getSupabaseClient } from "./supabase";
import type { MerchantGateway } from "./merchants";

export type LinkedCardAuthStatus = "pending" | "verified" | "failed";

export type LinkedCardInsert = {
  merchantId: string;
  gateway: MerchantGateway;
  gatewayCustomerId: string;
  gatewayPaymentMethodId: string | null;
  authStatus: LinkedCardAuthStatus;
  authAmountCents: number;
  currency: string;
  cvcCheck: string | null;
  declineCode: string | null;
  gatewayMetadata: Record<string, unknown>;
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
