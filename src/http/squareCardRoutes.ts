import type http from "http";
import { getMerchantCredentialsById } from "../db/merchants";
import { completeSquareCardFromNonce } from "../services/payment/squareCompleteCard";
import { createSquareClient, getDefaultSquareLocationId } from "../services/payment/squareClient";
import { verifySignedLinkToken } from "../utils/signedLinkToken";
import { buildSquareSaveCardPage } from "./hostedPagesHtml";

function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

/**
 * @returns true if the request was handled (response ended).
 */
export async function tryHandleSquareCardRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/square/save-card" && req.method === "GET") {
    const host = req.headers.host ?? "localhost";
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://${host}`);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad request");
      return true;
    }
    const token = url.searchParams.get("token");
    if (token === null || token.length === 0) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end("<p>Missing token.</p>");
      return true;
    }
    const parsed = verifySignedLinkToken(token);
    if (parsed === null) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end("<p>Invalid or expired link.</p>");
      return true;
    }

    const merchant = await getMerchantCredentialsById(parsed.merchantId);
    if (merchant === null || merchant.gateway !== "square") {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end("<p>Merchant not found.</p>");
      return true;
    }
    if (
      merchant.square_application_id === null ||
      merchant.square_application_id.length === 0 ||
      merchant.square_access_token === null ||
      merchant.square_access_token.length === 0
    ) {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" }).end("<p>Square credentials are not configured.</p>");
      return true;
    }

    try {
      const client = createSquareClient(merchant);
      const locationId = await getDefaultSquareLocationId(client);
      if (locationId === null) {
        res
          .writeHead(503, { "Content-Type": "text/html; charset=utf-8" })
          .end("<p>No Square location found for this account.</p>");
        return true;
      }
      const html = buildSquareSaveCardPage({
        applicationId: merchant.square_application_id,
        locationId,
        linkToken: token,
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    } catch (err) {
      console.error("square save-card page:", err);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" }).end("<p>Could not load card form.</p>");
    }
    return true;
  }

  if (pathname === "/square/save-card/complete" && req.method === "POST") {
    let body: Buffer;
    try {
      body = await readRequestBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "Bad body" }));
      return true;
    }
    let parsed: { token?: unknown; nonce?: unknown };
    try {
      parsed = JSON.parse(body.toString("utf8")) as { token?: unknown; nonce?: unknown };
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "Invalid JSON" }));
      return true;
    }
    const token = typeof parsed.token === "string" ? parsed.token : "";
    const nonce = typeof parsed.nonce === "string" ? parsed.nonce : "";
    const claims = verifySignedLinkToken(token);
    if (claims === null) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "Invalid or expired token" }));
      return true;
    }

    const result = await completeSquareCardFromNonce({
      merchantId: claims.merchantId,
      linkedCardId: claims.linkedCardId,
      nonce,
    });

    if (!result.ok) {
      res
        .writeHead(result.statusCode, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ error: result.message }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: true }));
    return true;
  }

  return false;
}
