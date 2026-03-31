import { getSupabaseClient } from "./supabase";

export type MerchantGateway = "stripe" | "square";

export type MerchantRow = {
  id: string;
  slug: string;
  display_name: string;
  gateway: MerchantGateway;
  stripe_secret_key: string | null;
  stripe_publishable_key: string | null;
  square_application_id: string | null;
  square_access_token: string | null;
  delay_between_operations_ms: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Safe for Telegram / logs — never includes raw secrets. */
export type MerchantPublic = {
  id: string;
  slug: string;
  display_name: string;
  gateway: MerchantGateway;
  credentialsConfigured: boolean;
  is_active: boolean;
};

function mapPublic(row: MerchantRow): MerchantPublic {
  const credentialsConfigured =
    row.gateway === "stripe"
      ? row.stripe_secret_key !== null && row.stripe_secret_key.length > 0
      : row.square_access_token !== null && row.square_access_token.length > 0;
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    gateway: row.gateway,
    credentialsConfigured,
    is_active: row.is_active,
  };
}

export async function listActiveMerchants(): Promise<MerchantPublic[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select(
      "id, slug, display_name, gateway, stripe_secret_key, stripe_publishable_key, square_application_id, square_access_token, delay_between_operations_ms, is_active, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as MerchantRow[];
  return rows.map(mapPublic);
}

export async function getMerchantById(id: string): Promise<MerchantPublic | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select(
      "id, slug, display_name, gateway, stripe_secret_key, stripe_publishable_key, square_application_id, square_access_token, delay_between_operations_ms, is_active, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }
  return mapPublic(data as MerchantRow);
}

export async function insertMerchant(input: {
  slug: string;
  displayName: string;
  gateway: MerchantGateway;
}): Promise<MerchantPublic> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .insert({
      slug: input.slug,
      display_name: input.displayName,
      gateway: input.gateway,
    })
    .select(
      "id, slug, display_name, gateway, stripe_secret_key, stripe_publishable_key, square_application_id, square_access_token, delay_between_operations_ms, is_active, created_at, updated_at",
    )
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }
  return mapPublic(data as MerchantRow);
}
