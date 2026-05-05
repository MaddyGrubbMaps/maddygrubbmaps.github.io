# Maddy Grubb Maps — Contact Form Worker

A Cloudflare Worker that receives contact form submissions from
maddygrubbmaps.com and relays them to Maddy's inbox via Brevo's
transactional email API.

```
Browser form  ─POST JSON─►  Worker (this code)  ─POST─►  Brevo API  ─SMTP─►  Maddy's inbox
```

## One-time setup

### 1. Brevo

1. Sign up at <https://www.brevo.com/> (free tier — 300 emails/day, plenty
   for a contact form).
2. **Verify a sender address.** In the Brevo dashboard go to *Senders, Domains
   & Dedicated IPs* → *Senders* → *Add a sender*. Use `maddygrubbmaps@gmail.com`
   (Brevo will email a confirmation link to that address).
3. **Generate an API key.** Go to *SMTP & API* → *API Keys* → *Generate a new
   API key*. Choose the *Transactional emails* scope. Copy the key — you only
   see it once.

### 2. Cloudflare Workers

1. Sign up at <https://workers.cloudflare.com/> (free tier — 100,000 requests
   per day).
2. Install Wrangler locally:
   ```sh
   npm install -g wrangler
   wrangler login
   ```
3. From this folder (`worker/`), set your secrets:
   ```sh
   wrangler secret put BREVO_API_KEY
   # paste the API key from step 1.3 when prompted

   wrangler secret put BREVO_SENDER_EMAIL
   # type maddygrubbmaps@gmail.com (the verified sender from step 1.2)

   wrangler secret put BREVO_TO_EMAIL
   # type maddygrubbmaps@gmail.com (or wherever you want submissions to land)
   ```
4. Deploy:
   ```sh
   wrangler deploy
   ```
   Wrangler prints the public Worker URL — it'll look like
   `https://maddygrubbmaps-contact.your-account.workers.dev`. Save this URL;
   you'll paste it into `Contact.html` so the form knows where to POST.

### 3. Wire up the contact form

Open `Contact.html` and find the comment that says
`<!-- BREVO_WORKER_URL -->`. Replace the placeholder URL on the line below
with your deployed Worker URL.

That's it — submit a test message, the email should arrive in Maddy's inbox
within a few seconds.

## Optional: Cloudflare Turnstile (spam protection)

Turnstile is Cloudflare's CAPTCHA-style challenge that doesn't make humans
click anything. Free, no third-party dependency, integrates cleanly here.

1. In the Cloudflare dashboard go to *Turnstile* → *Add Site*. Use
   `maddygrubbmaps.com` as the site name.
2. Copy the **Site Key** (public, goes in the form HTML) and the
   **Secret Key** (private, goes in the Worker).
3. Set the secret:
   ```sh
   wrangler secret put TURNSTILE_SECRET_KEY
   # paste the Secret Key
   ```
4. In `Contact.html`, find the Turnstile widget block and paste your
   **Site Key** into the `data-sitekey` attribute.

If `TURNSTILE_SECRET_KEY` is unset, the Worker skips Turnstile verification
entirely — so you can deploy without it and add it later.

## Local testing

```sh
wrangler dev --env dev
```

This starts the Worker locally on `http://localhost:8787` (or whichever port
Wrangler picks). The `dev` environment override lets `http://localhost:8765`
(the python http.server we use for local site testing) POST to it.

Quick smoke test:

```sh
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"Hello!"}'
```

You should see `{"ok":true}` and a real email should arrive (yes, even from
local dev — it hits the live Brevo API).

## Files

- `contact.js` — the Worker code itself.
- `wrangler.toml` — Worker config (name, compat date, allowed origin).
- `README.md` — this file.

## Troubleshooting

**"BREVO_API_KEY is not defined"** — secret never set. Re-run
`wrangler secret put BREVO_API_KEY`.

**Brevo returns 401** — API key is wrong or revoked. Generate a new one.

**Brevo returns 400 "Sender not allowed"** — the sender email isn't verified
in Brevo yet. Click the verification link they emailed you.

**Form submits but nothing arrives** — check the Worker logs in the
Cloudflare dashboard (*Workers* → your Worker → *Logs*). Look for the
"Brevo API error" line.

**CORS error in browser** — the request's `Origin` doesn't match
`ALLOWED_ORIGIN` in `wrangler.toml`. Update the var and re-deploy.
