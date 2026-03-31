import { getSupabaseClient } from "./supabase";
import type { MerchantGateway } from "./merchants";

export type PaymentTransactionStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "requires_action";

export type PaymentTransactionInsert = {
  merchantId: string;
  gateway: MerchantGateway;
  amountCents: number;
  currency: string;
  description: string | null;
  status: PaymentTransactionStatus;
  gatewayPaymentId: string | null;
  declineCode: string | null;
  cvcCheck: string | null;
  squareErrors: unknown;
  gatewayRaw: Record<string, unknown>;
};

export async function insertPaymentTransaction(
  row: PaymentTransactionInsert,
): Promise<{ id: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .insert({
      merchant_id: row.merchantId,
      gateway: row.gateway,
      amount_cents: row.amountCents,
      currency: row.currency,
      description: row.description,
      status: row.status,
      gateway_payment_id: row.gatewayPaymentId,
      decline_code: row.declineCode,
      cvc_check: row.cvcCheck,
      square_errors: row.squareErrors,
      gateway_raw: row.gatewayRaw,
    })
    .select("id")
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }
  return { id: (data as { id: string }).id };
}
