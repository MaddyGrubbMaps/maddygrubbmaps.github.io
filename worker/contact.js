/**
 * Maddy Grubb Maps — contact form Worker
 *
 * Receives POST requests from the contact form on maddygrubbmaps.com,
 * validates input + honeypot, optionally verifies a Cloudflare Turnstile
 * token, and relays the message as a transactional email via Brevo.
 *
 * Required Worker secrets (set with `wrangler secret put NAME`):
 *   BREVO_API_KEY      — Brevo transactional API key
 *   BREVO_SENDER_EMAIL — verified sender address (must be verified in Brevo)
 *   BREVO_TO_EMAIL     — destination address (Maddy's inbox)
 *
 * Optional secret:
 *   TURNSTILE_SECRET_KEY — only set if you also configure a Turnstile widget
 *                           on the contact form
 *
 * Public origin allowed for CORS — set in wrangler.toml `vars.ALLOWED_ORIGIN`
 * (defaults to https://maddygrubbmaps.com).
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://maddygrubbmaps.com';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, allowedOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400, allowedOrigin);
    }

    /* Honeypot — bots fill this in, real humans never see it. Quietly
       return success so the bot doesn't retry against another endpoint. */
    if (body.website && String(body.website).trim() !== '') {
      return json({ ok: true }, 200, allowedOrigin);
    }

    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const message = (body.message || '').toString().trim();

    if (!name || !email || !message) {
      return json({ ok: false, error: 'Name, email, and message are required.' }, 400, allowedOrigin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: 'Please provide a valid email address.' }, 400, allowedOrigin);
    }
    if (message.length > 8000) {
      return json({ ok: false, error: 'Message is too long (8000 character limit).' }, 400, allowedOrigin);
    }

    /* Optional Turnstile verification — only enforced if both the secret
       is configured AND the form sent a token. */
    if (env.TURNSTILE_SECRET_KEY && body.turnstileToken) {
      const ok = await verifyTurnstile(
        env.TURNSTILE_SECRET_KEY,
        body.turnstileToken,
        request.headers.get('cf-connecting-ip')
      );
      if (!ok) {
        return json({ ok: false, error: 'Spam check failed — please reload the page and try again.' }, 400, allowedOrigin);
      }
    }

    const subject = `New inquiry from ${name} via maddygrubbmaps.com`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #122A57;">
        <h2 style="font-weight: 600; margin: 0 0 16px;">New contact form submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap; padding: 16px; background: #F6F1E7; border-left: 3px solid #3F8775;">${escapeHtml(message)}</p>
        <hr style="border: none; border-top: 1px solid #D8CFB9; margin: 24px 0;">
        <p style="font-size: 12px; color: #6B6557;">Sent from the contact form on maddygrubbmaps.com</p>
      </div>
    `;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL, name: 'Maddy Grubb Maps' },
        replyTo: { email, name },
        to: [{ email: env.BREVO_TO_EMAIL }],
        subject,
        htmlContent: htmlBody,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error('Brevo API error:', brevoRes.status, errText);
      return json(
        { ok: false, error: "Couldn't send the message. Please try emailing directly at maddygrubbmaps@gmail.com." },
        500,
        allowedOrigin
      );
    }

    return json({ ok: true }, 200, allowedOrigin);
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function verifyTurnstile(secret, token, ip) {
  const fd = new FormData();
  fd.append('secret', secret);
  fd.append('response', token);
  if (ip) fd.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: fd,
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('Turnstile verify failed:', e);
    return false;
  }
}
