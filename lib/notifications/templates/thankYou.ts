const BRAND_NAME = "MLD Will Call";
const BRAND_COLOR = "#111827";
const ACCENT_COLOR = "#dbaa3c";
const OUTER_BG = "#f8f2e9";

function willCallLink() {
  const base = (process.env.FRONTEND_URL || "https://mld-willcall.vercel.app").replace(/\/+$/, "");
  return `${base}/`;
}

function renderThankYouTemplate({
  title,
  preheader,
  messageHtml,
  detailsHtml,
  ctaLabel,
  ctaHref,
  footer,
}: {
  title: string;
  preheader: string;
  messageHtml: string;
  detailsHtml?: string;
  ctaLabel?: string;
  ctaHref?: string;
  footer?: string;
}) {
  const frontendUrl = (process.env.FRONTEND_URL || "https://mld-willcall.vercel.app").replace(/\/$/, "");
  const logoUrl = `${frontendUrl}/brand/MLD-logo-gold.png`;
  const cta = ctaLabel && ctaHref
    ? `<a href="${ctaHref}" style="display:inline-block;background:${ACCENT_COLOR};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;">${ctaLabel}</a>`
    : "";
  const detailsBlock = detailsHtml
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">${detailsHtml}</table>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:${OUTER_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(17,24,39,0.08);">
            <tr>
              <td style="padding:24px 28px;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:center;">
                <div style="margin-bottom:8px;">
                  <img src="${logoUrl}" alt="MLD" style="height:32px;display:block;margin:0 auto;" />
                </div>
                <div style="font-size:18px;font-weight:700;color:${BRAND_COLOR};">${BRAND_NAME}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;">Thank you for your purchase</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${BRAND_COLOR};">${title}</h1>
                <div style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${messageHtml}</div>
                ${detailsBlock}
                ${cta}
                <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                  ${footer || "If you have any questions, please reach out to your salesperson."}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                This is an automated message from Mountain Land Design.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildThankYouWillCallEmail(
  orderNbr: string,
  customerId: string,
  billingZip: string,
  inviteCode: string
) {
  const subject = "Thank you for your purchase";
  const link = willCallLink();
  const detailsHtml = `
    <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px;">Registration details</td></tr>
    <tr><td style="font-size:14px;color:#374151;">Customer ID#: ${customerId}</td></tr>
    <tr><td style="font-size:14px;color:#374151;">Billing ZIP: ${billingZip}</td></tr>
    <tr><td style="font-size:14px;color:#374151;">Invite Code: <strong>${inviteCode}</strong></td></tr>
  `;
  const body = renderThankYouTemplate({
    title: "Thank you for your purchase",
    preheader: `Order ${orderNbr} has been received.`,
    messageHtml: `<p>Your order ${orderNbr ? `(${orderNbr})` : ""} has been received.</p><p>To create your Will Call account, use the details below.</p>`,
    detailsHtml,
    ctaLabel: "Open Will Call",
    ctaHref: link,
  });
  return { subject, body };
}

export function buildThankYouWillCallSms(orderNbr: string) {
  const link = willCallLink();
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  return `MLD: Thank you for your purchase.${orderLine} Create your Will Call account here: ${link} We will text you with any changes to your order.`;
}

export function buildThankYouWillCallLoginEmail(orderNbr: string) {
  const subject = "Thank you for your purchase";
  const link = willCallLink();
  const body = renderThankYouTemplate({
    title: "Thank you for your purchase",
    preheader: `Order ${orderNbr} has been received.`,
    messageHtml: `<p>Your order ${orderNbr ? `(${orderNbr})` : ""} has been received.</p><p>Please click below to log in to your Will Call account.</p>`,
    ctaLabel: "Log In To Will Call",
    ctaHref: link,
  });
  return { subject, body };
}

export function buildThankYouWillCallLoginSms(orderNbr: string) {
  const link = willCallLink();
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  return `MLD: Thank you for your purchase.${orderLine} Please log in to your Will Call account here: ${link} We will text you with any changes to your order.`;
}

export function buildThankYouDeliveryEmail(orderNbr: string) {
  const subject = "Thank you for your purchase";
  const detailsHtml = `
    <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px;">What happens next</td></tr>
    <tr><td style="font-size:14px;color:#374151;">When your order is 6 weeks away from delivery, we will reach out to confirm by text and/or email.</td></tr>
    <tr><td style="font-size:14px;color:#374151;padding-top:8px;">Once you confirm, we will send reminders, order updates, and product ETAs.</td></tr>
  `;
  const body = renderThankYouTemplate({
    title: "Thank you for your purchase",
    preheader: `Order ${orderNbr} has been received.`,
    messageHtml: `<p>Your order ${orderNbr ? `(${orderNbr})` : ""} has been received.</p>`,
    detailsHtml,
    footer: "If you have any questions, please reach out to your salesperson.",
  });
  return { subject, body };
}

export function buildThankYouDeliverySms(orderNbr: string) {
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  return `MLD: Thank you for your purchase.${orderLine} When your order is 6 weeks away from delivery, we will reach out to confirm. We will text you with any changes to your order.`;
}
