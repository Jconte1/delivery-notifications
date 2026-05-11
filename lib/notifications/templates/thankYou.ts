const BRAND_COLOR = "#111827";
const ACCENT_COLOR = "#dbaa3c";
const OUTER_BG = "#f8f2e9";

function willCallLink() {
  const base = (process.env.FRONTEND_URL || "https://mld-willcall.vercel.app").replace(/\/+$/, "");
  return `${base}/`;
}

function willCallRegisterPrefillLink(token: string) {
  const base = (process.env.FRONTEND_URL || "https://mld-willcall.vercel.app").replace(/\/+$/, "");
  return `${base}/?register=1&prefillToken=${encodeURIComponent(token)}`;
}

type ThankYouContext = {
  orderNbr: string;
  buyerGroup?: string | null;
  orderType?: string | null;
  customerName?: string | null;
  locationName?: string | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizedUpper(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function formatOrderGroup(input: ThankYouContext) {
  const buyerGroup = normalizeText(input.buyerGroup);
  if (buyerGroup) return buyerGroup;
  const orderType = normalizedUpper(input.orderType);
  if (orderType === "PG" || orderType === "PL") return "Plumbing";
  if (orderType === "HW" || orderType === "HC") return "Hardware";
  if (orderType === "SO" || orderType === "R1" || orderType === "RP" || orderType === "C1") return "Appliance";
  return orderType || "Order";
}

function formatCustomerLocationSegment(locationName?: string | null) {
  const location = normalizeText(locationName);
  if (!location) return "";
  const upper = normalizedUpper(location);
  if (upper === "MAIN" || upper === "PRIMARY LOCATION") return "";
  return ` / ${location}`;
}

function buildWillCallThankYouSubject(input: ThankYouContext) {
  const group = formatOrderGroup(input);
  const order = normalizeText(input.orderNbr);
  const customer = normalizeText(input.customerName) || "Customer";
  const location = normalizeText(input.locationName);
  const parts = [group, order, customer];
  if (location) {
    const upper = normalizedUpper(location);
    if (upper !== "MAIN" && upper !== "PRIMARY LOCATION") parts.push(location);
  }
  return parts.join(" | ");
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

export function buildThankYouWillCallEmail(input: ThankYouContext & { prefillToken?: string | null }) {
  const subject = buildWillCallThankYouSubject(input);
  const orderLabel = input.orderNbr ? String(input.orderNbr).trim() : "";
  const orderGroup = formatOrderGroup(input);
  const customer = normalizeText(input.customerName) || "Customer";
  const locationSuffix = formatCustomerLocationSegment(input.locationName);
  const link = input.prefillToken ? willCallRegisterPrefillLink(input.prefillToken) : willCallLink();
  const body = renderThankYouTemplate({
    title: "Thank you for your purchase",
    preheader: `Order ${orderLabel} has been confirmed.`,
    messageHtml: `<p>Your ${orderGroup} order ${orderLabel} for ${customer}${locationSuffix} has been confirmed and in processing.</p><p>To track product, order status, and schedule pickup, complete registration on the customer dashboard here:</p>`,
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

export function buildThankYouWillCallPrefillSms(orderNbr: string, prefillLink: string) {
  const link = prefillLink || willCallLink();
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  return `MLD: Thank you for your purchase.${orderLine} Finish your Will Call account setup here: ${link} We will text you with any changes to your order.`;
}

export function buildThankYouWillCallLoginEmail(input: ThankYouContext) {
  const subject = buildWillCallThankYouSubject(input);
  const link = willCallLink();
  const orderLabel = input.orderNbr ? String(input.orderNbr).trim() : "";
  const orderGroup = formatOrderGroup(input);
  const customer = normalizeText(input.customerName) || "Customer";
  const locationSuffix = formatCustomerLocationSegment(input.locationName);
  const body = renderThankYouTemplate({
    title: "Thank you for your purchase",
    preheader: `Order ${orderLabel} has been confirmed.`,
    messageHtml: `<p>Your ${orderGroup} order ${orderLabel} for ${customer}${locationSuffix} has been confirmed and in processing.</p><p>To track product, order status, and schedule pickup, sign in to the customer dashboard here:</p>`,
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

export function buildThankYouDeliveryEmail(orderNbr: string, deliveryDate?: Date | null) {
  const subject = "Thank you for your purchase";
  const requestedDate = deliveryDate ? deliveryDate.toLocaleDateString("en-US") : "TBD";
  const detailsHtml = `
    <tr><td style="font-size:14px;color:#374151;padding-bottom:8px;">Current Requested Delivery Date: ${requestedDate}</td></tr>
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

export function buildThankYouDeliverySms(orderNbr: string, deliveryDate?: Date | null) {
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  const requestedDate = deliveryDate ? deliveryDate.toLocaleDateString("en-US") : "TBD";
  return `MLD: Thank you for your purchase.${orderLine} Current requested delivery date is ${requestedDate}. When your order is 6 weeks away from delivery, we will reach out to confirm. We will text you with any changes to your order.`;
}

export function buildThankYouDeliveryUnder6WeeksEmail(orderNbr: string) {
  const subject = "Thank you for your purchase";
  const detailsHtml = `
    <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px;">What happens next</td></tr>
    <tr><td style="font-size:14px;color:#374151;">Your salesperson will be in touch to confirm delivery date and details.</td></tr>
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

export function buildThankYouDeliveryUnder6WeeksSms(orderNbr: string, deliveryDate?: Date | null) {
  const orderLine = orderNbr ? ` Order ${orderNbr}.` : "";
  const requestedDate = deliveryDate ? deliveryDate.toLocaleDateString("en-US") : "TBD";
  return `MLD: Thank you for your purchase.${orderLine} Current requested delivery date is ${requestedDate}. Your salesperson will be in touch to confirm delivery date and details.`;
}
