import http from "http";
import { env } from "../config/env";
import { stripeSetupCancelHtml, stripeSetupSuccessHtml } from "./hostedPagesHtml";
import { tryHandleSquareCardRoutes } from "./squareCardRoutes";
import { handleStripeWebhookRequest } from "../webhooks/stripeCheckoutWebhook";

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

export function startStripeWebhookServer(): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const host = req.headers.host ?? "localhost";
      let url: URL;
      try {
        url = new URL(req.url ?? "/", `http://${host}`);
      } catch {
        res.writeHead(400).end();
        return;
      }

      const pathname = url.pathname;

      const squareHandled = await tryHandleSquareCardRoutes(req, res, pathname);
      if (squareHandled) {
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("ok");
        return;
      }

      if (req.method === "GET" && pathname === "/stripe/setup-success") {
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(stripeSetupSuccessHtml);
        return;
      }

      if (req.method === "GET" && pathname === "/stripe/setup-cancel") {
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(stripeSetupCancelHtml);
        return;
      }

      const webhookMatch = pathname.match(/^\/webhooks\/stripe\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
      if (req.method === "POST" && webhookMatch !== null) {
        const merchantId = webhookMatch[1];
        const rawBody = await readRequestBody(req);
        const signature = req.headers["stripe-signature"];
        const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
        const { status, body } = await handleStripeWebhookRequest({
          merchantId,
          rawBody,
          signatureHeader,
        });
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(body);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    })().catch((err) => {
      console.error("HTTP server error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Internal error");
      }
    });
  });

  server.listen(env.httpPort, () => {
    console.log(
      `HTTP server listening on port ${env.httpPort} (Stripe webhooks, Square card capture, Checkout return pages).`,
    );
  });

  return server;
}
