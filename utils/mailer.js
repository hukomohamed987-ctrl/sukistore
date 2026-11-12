/**
 * Small Resend e-mail helper (same account/settings as the OTP e-mails).
 * Needs RESEND_API_KEY (and a verified RESEND_FROM domain to reach any inbox).
 */
const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendEmail({ to, subject, html }) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };
  const from = (process.env.RESEND_FROM || 'سوقي ستور <onboarding@resend.dev>').trim();
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) console.warn('Resend e-mail warning:', data);
    return { ok: r.ok, data };
  } catch (err) {
    console.error('Resend e-mail error:', err.message);
    return { ok: false, error: err.message };
  }
}

// Wrap plain text (customer-facing) in the store's simple RTL e-mail layout
function storeEmailHtml(title, bodyText) {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background:#fff; color:#1e293b;">
      <h1 style="color:#059669; margin:0 0 4px; font-size:22px;">سوقي ستور</h1>
      <p style="color:#64748b; font-size:13px; margin:0 0 18px;">${esc(title)}</p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; font-size:14px; line-height:1.8; white-space:pre-line;">${esc(bodyText)}</div>
      <p style="font-size:11px; color:#94a3b8; text-align:center; margin-top:20px;">© ${new Date().getFullYear()} سوقي ستور</p>
    </div>`;
}

module.exports = { sendEmail, storeEmailHtml, esc };
