import { env } from "../config/env";

function squareScriptSrc(): string {
  return env.squareEnvironment === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

/**
 * Square Web Payments — hosted card form (dark fintech panel, distinct typography).
 */
export function buildSquareSaveCardPage(input: {
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
  <meta name="robots" content="noindex,nofollow"/>
  <title>Secure card — PayMaster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg0: #070b14;
      --bg1: #121a2e;
      --accent: #2dd4bf;
      --accent-dim: rgba(45, 212, 191, 0.15);
      --text: #e8edf5;
      --muted: #94a3b8;
      --panel: rgba(255, 255, 255, 0.06);
      --panel-border: rgba(255, 255, 255, 0.1);
      --danger: #f87171;
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "DM Sans", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 600px at 80% -10%, rgba(45, 212, 191, 0.12), transparent 55%),
        radial-gradient(800px 400px at 10% 100%, rgba(99, 102, 241, 0.08), transparent 50%),
        linear-gradient(165deg, var(--bg0), var(--bg1));
    }
    .shell {
      max-width: 420px;
      margin: 0 auto;
      padding: clamp(1.5rem, 5vw, 2.75rem) 1.25rem 3rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin-bottom: 1.75rem;
    }
    .brand-mark {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent), #6366f1);
      display: grid;
      place-items: center;
      font-family: "Syne", sans-serif;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: -0.02em;
      color: #0f172a;
    }
    .brand h1 {
      margin: 0;
      font-family: "Syne", sans-serif;
      font-weight: 700;
      font-size: 1.35rem;
      letter-spacing: -0.03em;
    }
    .brand span {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--muted);
      margin-top: 0.15rem;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius);
      padding: 1.5rem 1.35rem 1.6rem;
      backdrop-filter: blur(12px);
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    }
    .panel p.lead {
      margin: 0 0 1.25rem;
      font-size: 0.95rem;
      line-height: 1.55;
      color: var(--muted);
    }
    .panel p.lead strong { color: var(--text); font-weight: 600; }
    #card-container {
      min-height: 100px;
      margin-bottom: 1.25rem;
      padding: 0.5rem 0;
    }
    /* Square injects iframe — give it breathing room */
    #card-container iframe {
      border-radius: 10px !important;
    }
    button[type="submit"] {
      width: 100%;
      border: none;
      border-radius: 12px;
      padding: 0.9rem 1rem;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      color: #0f172a;
      background: linear-gradient(180deg, #5eead4, var(--accent));
      box-shadow: 0 8px 24px rgba(45, 212, 191, 0.25);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    button[type="submit"]:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 28px rgba(45, 212, 191, 0.35);
    }
    button[type="submit"]:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
    }
    #msg {
      min-height: 1.4rem;
      margin-top: 1rem;
      font-size: 0.88rem;
      line-height: 1.45;
    }
    #msg.err { color: var(--danger); }
    #msg.ok { color: var(--accent); font-weight: 600; }
    .fine {
      margin-top: 1.5rem;
      font-size: 0.72rem;
      color: var(--muted);
      line-height: 1.5;
      text-align: center;
    }
    .fine code { color: #cbd5e1; }
    #success-wrap {
      display: none;
      text-align: center;
      padding: 0.5rem 0 0.25rem;
    }
    #success-wrap .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      background: var(--accent-dim);
      display: grid;
      place-items: center;
      animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #success-wrap .icon svg { width: 32px; height: 32px; stroke: var(--accent); }
    #success-wrap h2 {
      margin: 0 0 0.5rem;
      font-family: "Syne", sans-serif;
      font-size: 1.35rem;
    }
    #success-wrap p { margin: 0; color: var(--muted); font-size: 0.95rem; line-height: 1.5; }
    @keyframes pop {
      from { transform: scale(0.6); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    #form-wrap.hidden { display: none; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="brand">
      <div class="brand-mark">PM</div>
      <div>
        <h1>Save your card</h1>
        <span>Square · secure checkout</span>
      </div>
    </div>
    <div class="panel">
      <div id="form-wrap">
        <p class="lead">Enter your card below. <strong>Card numbers are never typed in Telegram</strong> — this page is hosted by your payment stack.</p>
        <form id="card-form">
          <div id="card-container"></div>
          <button type="submit" id="submit-btn">Save card securely</button>
        </form>
        <p id="msg" class="err" aria-live="polite"></p>
      </div>
      <div id="success-wrap">
        <div class="icon">
          <svg fill="none" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h2>Card saved</h2>
        <p>You can close this tab and return to Telegram.</p>
      </div>
    </div>
    <p class="fine">Protected session · <code>square.js</code> tokenization</p>
  </div>
  <script src="${scriptSrc}"></script>
  <script>
    (function () {
      const APP_ID = ${appIdJson};
      const LOCATION_ID = ${locIdJson};
      const LINK_TOKEN = ${tokenJson};

      async function run() {
        var msg = document.getElementById("msg");
        var submitBtn = document.getElementById("submit-btn");
        var formWrap = document.getElementById("form-wrap");
        var successWrap = document.getElementById("success-wrap");
        function setErr(t) {
          if (!msg) return;
          msg.className = "err";
          msg.textContent = t || "";
        }
        function setOk(t) {
          if (!msg) return;
          msg.className = "ok";
          msg.textContent = t || "";
        }
        if (!window.Square) {
          setErr("Payment SDK failed to load. Check your connection and try again.");
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
            setErr("");
            if (submitBtn) submitBtn.disabled = true;
            var tokenResult = await card.tokenize();
            if (tokenResult.status !== "OK") {
              if (submitBtn) submitBtn.disabled = false;
              var em = (tokenResult.errors && tokenResult.errors[0] && tokenResult.errors[0].message) || "Could not read this card.";
              setErr(em);
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
              if (submitBtn) submitBtn.disabled = false;
              setErr(data.error || ("Error " + res.status));
              return;
            }
            if (formWrap) formWrap.classList.add("hidden");
            if (successWrap) successWrap.style.display = "block";
          });
        } catch (err) {
          setErr(err && err.message ? err.message : "Could not start the card form.");
        }
      }
      void run();
    })();
  </script>
</body>
</html>`;
}

/** Stripe Checkout return — success (light editorial, distinct from Square). */
export const stripeSetupSuccessHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Card verified — PayMaster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --paper: #fafaf9;
      --ink: #1c1917;
      --muted: #57534e;
      --green: #059669;
      --green-soft: #d1fae5;
      --radius: 20px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Source Sans 3", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 500px at 50% -20%, rgba(5, 150, 105, 0.12), transparent 60%),
        linear-gradient(180deg, #f5f5f4, var(--paper));
    }
    .wrap {
      max-width: 440px;
      margin: 0 auto;
      padding: clamp(2rem, 6vw, 3.5rem) 1.25rem;
    }
    .card {
      background: #fff;
      border-radius: var(--radius);
      padding: 2rem 1.75rem 2.25rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06), 0 20px 40px -12px rgba(0,0,0,0.12);
      border: 1px solid rgba(0,0,0,0.04);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--green-soft);
      margin-bottom: 1.25rem;
    }
    .badge svg { width: 28px; height: 28px; stroke: var(--green); fill: none; stroke-width: 2.2; }
    h1 {
      margin: 0 0 0.5rem;
      font-family: "Fraunces", Georgia, serif;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 1rem;
    }
    .stripe-note {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e7e5e4;
      font-size: 0.8rem;
      color: #a8a29e;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="badge">
        <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <h1>You're all set</h1>
      <p>Your card was verified through Stripe. You can close this window and go back to Telegram.</p>
      <p class="stripe-note">If this tab opened from PayMaster, your operator console will update automatically.</p>
    </div>
  </div>
</body>
</html>`;

export const stripeSetupCancelHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Checkout canceled — PayMaster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet"/>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Source Sans 3", system-ui, sans-serif;
      color: #44403c;
      background: linear-gradient(165deg, #fafaf9 0%, #f5f5f4 50%, #e7e5e4 100%);
    }
    .wrap {
      max-width: 440px;
      margin: 0 auto;
      padding: clamp(2rem, 6vw, 3.5rem) 1.25rem;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 2rem 1.75rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06), 0 20px 40px -12px rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.05);
      text-align: center;
    }
    .icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 1rem;
      border-radius: 50%;
      background: #fef3c7;
      display: grid;
      place-items: center;
    }
    .icon svg { width: 26px; height: 26px; stroke: #d97706; fill: none; stroke-width: 2; }
    h1 {
      margin: 0 0 0.5rem;
      font-family: "Fraunces", Georgia, serif;
      font-size: 1.45rem;
      font-weight: 600;
      color: #292524;
    }
    p { margin: 0; color: #78716c; line-height: 1.6; font-size: 1rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="icon">
        <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </div>
      <h1>Checkout canceled</h1>
      <p>No changes were made. Return to Telegram and start again when you're ready.</p>
    </div>
  </div>
</body>
</html>`;
