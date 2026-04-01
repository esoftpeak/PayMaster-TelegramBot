import { SquareClient, SquareEnvironment } from "square";
import { env } from "../../config/env";
import type { MerchantCredentialsRow } from "../../db/merchants";

export function squareEnvironmentValue(): typeof SquareEnvironment.Sandbox | typeof SquareEnvironment.Production {
  return env.squareEnvironment === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
}

export function createSquareClient(merchant: MerchantCredentialsRow): SquareClient {
  const token = merchant.square_access_token;
  if (token === null || token.length === 0) {
    throw new Error("Square access token is missing for this merchant.");
  }
  return new SquareClient({
    token,
    environment: squareEnvironmentValue(),
  });
}

export async function getDefaultSquareLocationId(client: SquareClient): Promise<string | null> {
  const res = await client.locations.list();
  if (res.errors !== undefined && res.errors.length > 0) {
    console.error("Square locations.list:", res.errors);
    return null;
  }
  const locs = res.locations ?? [];
  const active = locs.find((l) => l.status === "ACTIVE") ?? locs[0];
  return active?.id ?? null;
}
