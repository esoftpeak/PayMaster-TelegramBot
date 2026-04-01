import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";

type Payload = {
  m: string;
  l: string;
  exp: number;
};

function encodePayload(p: Payload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

function decodePayload(b64: string): Payload | null {
  try {
    const raw = Buffer.from(b64, "base64url").toString("utf8");
    const p = JSON.parse(raw) as Payload;
    if (typeof p.m !== "string" || typeof p.l !== "string" || typeof p.exp !== "number") {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function createSignedLinkToken(input: { merchantId: string; linkedCardId: string; ttlSeconds?: number }): string {
  const ttl = input.ttlSeconds ?? 3600;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = encodePayload({ m: input.merchantId, l: input.linkedCardId, exp });
  const sig = createHmac("sha256", env.supabaseServiceRoleKey).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySignedLinkToken(token: string): { merchantId: string; linkedCardId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sig] = parts;
  const expectedSig = createHmac("sha256", env.supabaseServiceRoleKey).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length) {
    return null;
  }
  try {
    if (!timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  const payload = decodePayload(payloadB64);
  if (payload === null) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { merchantId: payload.m, linkedCardId: payload.l };
}
