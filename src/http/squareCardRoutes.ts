import type http from "http";
import { env } from "../config/env";
import { getMerchantCredentialsById } from "../db/merchants";
import { completeSquareCardFromNonce } from "../services/payment/squareCompleteCard";
import { createSquareClient, getDefaultSquareLocationId } from "../services/payment/squareClient";
import { verifySignedLinkToken } from "../utils/signedLinkToken";

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

function squareScriptSrc(): string {
  return env.squareEnvironment === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

function buildSaveCardPage(input: {
  applicationId: string;
  locationId: string;
  linkToken: string;
}): string {
  const scriptSrc = squareScriptSrc();
  const appIdJson = JSON.stringify(input.applicationId);
  const locIdJson = JSON.stringify(input.locationId);
  const tokenJson = JSON.stringify(input.linkToken);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Add card — Square</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    #card-container { min-height: 90px; margin: 1rem 0; }
    #msg { color: #b00020; min-height: 1.25rem; }
    button { padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Save card</h1>
  <p>Enter your card details. Nothing is typed in Telegram.</p>
  <form id="card-form">
    <div id="card-container"></div>
    <button type="submit">Save card</button>
  </form>
  <p id="msg"></p>
  <script src="${scriptSrc}"></script>
  <script>
    (function () {
      const APP_ID = ${appIdJson};
      const LOCATION_ID = ${locIdJson};
      const LINK_TOKEN = ${tokenJson};

      async function run() {
        var msg = document.getElementById("msg");
        if (!window.Square) {
          if (msg) msg.textContent = "Square.js failed to load.";
          return;
        }
        try {
          var payments = window.Square.payments(APP_ID, LOCATION_ID);
          var card = await payments.card();
          await card.attach("#card-container");
          var form = document.getElementById("card-form");
          if (!form) return;
          form.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (msg) msg.textContent = "";
            var tokenResult = await card.tokenize();
            if (tokenResult.status !== "OK") {
              if (msg) msg.textContent = (tokenResult.errors && tokenResult.errors[0] && tokenResult.errors[0].message) || "Could not tokenize card.";
              return;
            }
            var nonce = tokenResult.token;
            var res = await fetch("/square/save-card/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: LINK_TOKEN, nonce: nonce }),
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) {
              if (msg) msg.textContent = data.error || ("Error " + res.status);
              return;
            }
            if (msg) msg.textContent = "Card saved. You can close this tab and return to Telegram.";
            if (msg) msg.style.color = "#0d47a1";
          });
        } catch (err) {
          if (msg) msg.textContent = err && err.message ? err.message : "Could not start Square card form.";
        }
      }
      void run();
    })();
  </script>
</body>
</html>`;
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
      const html = buildSaveCardPage({
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
