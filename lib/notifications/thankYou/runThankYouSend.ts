import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";
import { fetchThankYouCandidates } from "@/lib/acumatica/fetch/fetchThankYouCandidates";
import { sendEmail } from "@/lib/notifications/providers/email/sendEmail";
import { sendSms } from "@/lib/notifications/providers/sms/sendSms";
import {
  buildThankYouDeliveryEmail,
  buildThankYouDeliverySms,
  buildThankYouDeliveryUnder6WeeksEmail,
  buildThankYouDeliveryUnder6WeeksSms,
  buildThankYouWillCallEmail,
  buildThankYouWillCallPrefillSms,
  buildThankYouWillCallLoginEmail,
  buildThankYouWillCallLoginSms,
  buildThankYouWillCallSms,
} from "@/lib/notifications/templates/thankYou";
import { requestInviteCode } from "@/lib/invites/requestInviteCode";
import { createRegistrationPrefillToken } from "@/lib/notifications/thankYou/prefillToken";

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function resolveSmsPhone(row: { attributeSiteNumber: string | null; attributeSmsTxt: string | null }) {
  return normalizePhone(row.attributeSiteNumber) || normalizePhone(row.attributeSmsTxt);
}

function isOpenStatus(status: string | null) {
  return String(status || "").toLowerCase() === "open";
}

function isWillCallShipVia(value: string | null) {
  const s = String(value || "").toLowerCase().trim();
  return s.includes("will") || s.includes("trans");
}

function isDeliveryShipVia(value: string | null) {
  const s = String(value || "").toLowerCase().trim();
  return (
    s.includes("delivery") ||
    s === "del" ||
    s.startsWith("del ") ||
    s.startsWith("del-")
  );
}

function toDateKeyInDenver(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((x) => Number(x));
  const base = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  base.setUTCDate(base.getUTCDate() + days);
  const nextYear = base.getUTCFullYear();
  const nextMonth = String(base.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(base.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getPrefillShortLinkBase() {
  return (
    process.env.THANK_YOU_SHORT_LINK_BASE_URL ||
    process.env.DELIVERY_NOTIFICATIONS_URL ||
    "https://delivery-notifications.vercel.app"
  ).replace(/\/+$/, "");
}

function buildPrefillShortCode() {
  // 8 chars URL-safe code
  return crypto.randomBytes(6).toString("base64url");
}

function getPrefillExpiry(now: Date) {
  const ttlHours = Math.max(1, Number(process.env.WILLCALL_SMS_PREFILL_TTL_HOURS || 24));
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

async function createSmsPrefillShortLink(orderNbr: string, token: string, now: Date) {
  const expiresAt = getPrefillExpiry(now);

  for (let i = 0; i < 6; i++) {
    const code = buildPrefillShortCode();
    try {
      await prisma.thankYouNotification.update({
        where: { orderNbr },
        data: {
          smsPrefillCode: code,
          smsPrefillToken: token,
          smsPrefillExpiresAt: expiresAt,
        },
      });
      return `${getPrefillShortLinkBase()}/api/public/thank-you-prefill/${encodeURIComponent(code)}`;
    } catch (err: any) {
      if (err?.code === "P2002") continue;
      throw err;
    }
  }

  throw new Error("Unable to allocate unique short code");
}

export async function runThankYouSend() {
  const candidates = await fetchThankYouCandidates();

  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let smsSent = 0;
  let smsSkipped = 0;
  let smsFailed = 0;
  let emailSent = 0;
  let emailSkipped = 0;
  let emailFailed = 0;
  const skipReasons: Record<string, number> = {};
  const failedReasons: Record<string, number> = {};
  const skippedOrders: Array<{
    orderNbr: string | null;
    reason: string;
    shipVia: string | null;
  }> = [];
  const channelOutcomes: Array<{
    orderNbr: string | null;
    smsEligible: boolean;
    smsSent: boolean;
    smsSkipped: boolean;
    smsError: string | null;
    emailEligible: boolean;
    emailSent: boolean;
    emailSkipped: boolean;
    emailError: string | null;
  }> = [];

  function noteSkip(orderNbr: string | null, reason: string, shipVia?: string | null) {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    if (skippedOrders.length < 25) {
      skippedOrders.push({ orderNbr, reason, shipVia: shipVia ?? null });
    }
  }

  function noteFail(reason: string) {
    failed += 1;
    failedReasons[reason] = (failedReasons[reason] || 0) + 1;
  }

  for (const row of candidates) {
    if (!row.orderNbr) {
      noteSkip(null, "missing-orderNbr", row.shipVia);
      continue;
    }

    const smsPhone = resolveSmsPhone(row);
    const email = normalizeEmail(row.attributeEmailNoty);
    const smsOptIn = row.attributeSmsOptIn === true;
    const emailOptIn = row.attributeEmailOptIn === true;
    const customerId = row.customerId ? String(row.customerId).trim() : "";
    const billingZip = row.billingZip ? String(row.billingZip).trim() : "";
    const upsertBase = {
      orderType: row.orderType ?? null,
      status: row.status ?? null,
      deliveryDate: row.deliveryDate ?? null,
      customerId: customerId || null,
      billingZip: billingZip || null,
      shipVia: row.shipVia ?? null,
      turnInDate: row.turnInDate ?? null,
      smsOptIn,
      emailOptIn,
      smsPhone: smsPhone ?? null,
      email: email ?? null,
    };

    // Keep table in sync with every fetched order, even if it is skipped for send.
    await prisma.thankYouNotification.upsert({
      where: { orderNbr: row.orderNbr },
      create: { orderNbr: row.orderNbr, ...upsertBase },
      update: upsertBase,
    });

    if (!isOpenStatus(row.status)) {
      noteSkip(row.orderNbr, "status-not-open", row.shipVia);
      continue;
    }
    const willCall = isWillCallShipVia(row.shipVia);
    const delivery = isDeliveryShipVia(row.shipVia);
    if (!willCall && !delivery) {
      // TODO: send a separate thank-you message for non-will-call/non-delivery orders.
      noteSkip(row.orderNbr, "shipVia-not-supported", row.shipVia);
      continue;
    }
    if (row.attributeThankYou === true) {
      noteSkip(row.orderNbr, "thankYou-already-true", row.shipVia);
      continue;
    }
    const smsEligible = smsOptIn && Boolean(smsPhone);
    const emailEligible = emailOptIn && Boolean(email);
    if (!smsEligible && !emailEligible) {
      noteSkip(row.orderNbr, "no-eligible-channel", row.shipVia);
      continue;
    }

    if (willCall && emailEligible && (!customerId || !billingZip)) {
      noteSkip(row.orderNbr, "missing-customerId-or-billingZip", row.shipVia);
      continue;
    }

    const existing = await prisma.thankYouNotification.findUnique({
      where: { orderNbr: row.orderNbr },
    });
    if (existing?.firstSentAt && !existing.acumaticaUpdatedAt) {
      noteSkip(row.orderNbr, "already-sent-awaiting-acumatica-sync", row.shipVia);
      continue;
    }

    attempted += 1;
    const now = new Date();
    let deliveryUnderSixWeeks = false;
    if (delivery) {
      if (row.deliveryDate) {
        const todayDenver = toDateKeyInDenver(now);
        const sixWeeksFromNowDenver = addDaysToDateKey(todayDenver, 42);
        const deliveryDateDenver = toDateKeyInDenver(row.deliveryDate);
        // Exactly 6 weeks is treated as "over 6 weeks", so under-6-weeks is strictly less-than.
        deliveryUnderSixWeeks = deliveryDateDenver < sixWeeksFromNowDenver;
      } else {
        // Missing/invalid delivery date falls back to current over-6-weeks messaging.
        deliveryUnderSixWeeks = false;
      }
    }
    let smsOk = false;
    let emailOk = false;
    const errors: string[] = [];
    let smsSkippedForOrder = false;
    let emailSkippedForOrder = false;
    let smsErrorForOrder: string | null = null;
    let emailErrorForOrder: string | null = null;
    let willCallLoginOnly = false;
    let willCallInviteCode: string | null = null;
    let registrationPrefillToken: string | null = null;
    let registrationPrefillShortLink: string | null = null;
    let invitePrepError: string | null = null;
    const emailContext = {
      orderNbr: row.orderNbr,
      buyerGroup: row.attributeBuyerGroup,
      orderType: row.orderType,
      customerName: row.customerName,
      locationName: row.locationName,
    };

    if (willCall && emailEligible && email) {
      try {
        const inviteDispatch = await requestInviteCode({
          customerId,
          billingZip,
          email,
        });
        if (inviteDispatch.kind === "existing-account") {
          willCallLoginOnly = true;
        } else {
          willCallInviteCode = inviteDispatch.code;
        }
      } catch (err) {
        const message = String((err as Error)?.message || err);
        invitePrepError = message;
        emailFailed += 1;
        emailErrorForOrder = message;
        errors.push(`email:${message}`);
      }
    }

    if (willCall && willCallInviteCode && customerId && billingZip) {
      try {
        registrationPrefillToken = createRegistrationPrefillToken({
          customerId,
          billingZip,
          inviteCode: willCallInviteCode,
          email,
          orderNbr: row.orderNbr,
        });
      } catch (tokenErr) {
        console.error("[thank-you] prefill token issue; using fallback links", {
          orderNbr: row.orderNbr,
          error: String((tokenErr as Error)?.message || tokenErr),
        });
      }

      if (registrationPrefillToken) {
        try {
          registrationPrefillShortLink = await createSmsPrefillShortLink(
            row.orderNbr,
            registrationPrefillToken,
            now
          );
        } catch (shortErr) {
          console.error("[thank-you] short-link issue; using fallback sms link", {
            orderNbr: row.orderNbr,
            error: String((shortErr as Error)?.message || shortErr),
          });
        }
      }
    }

    if (smsEligible && smsPhone) {
      try {
        let smsBody: string;
        if (willCall) {
          if (willCallLoginOnly) {
            smsBody = buildThankYouWillCallLoginSms(row.orderNbr);
          } else if (willCallInviteCode && customerId && billingZip) {
            smsBody = registrationPrefillShortLink
              ? buildThankYouWillCallPrefillSms(row.orderNbr, registrationPrefillShortLink)
              : buildThankYouWillCallSms(row.orderNbr);
          } else {
            smsBody = buildThankYouWillCallSms(row.orderNbr);
          }
        } else {
          smsBody = deliveryUnderSixWeeks
            ? buildThankYouDeliveryUnder6WeeksSms(row.orderNbr, row.deliveryDate)
            : buildThankYouDeliverySms(row.orderNbr, row.deliveryDate);
        }
        const res = await sendSms(smsPhone, smsBody);
        smsOk = res.ok && !res.skipped;
        if (res.skipped) {
          smsSkipped += 1;
          smsSkippedForOrder = true;
        }
        if (smsOk) {
          smsSent += 1;
        }
      } catch (err) {
        const message = String((err as Error)?.message || err);
        smsFailed += 1;
        smsErrorForOrder = message;
        errors.push(`sms:${message}`);
      }
    } else {
      smsSkipped += 1;
      smsSkippedForOrder = true;
    }

    if (emailEligible && email) {
      try {
        if (willCall && invitePrepError) {
          // Invite preflight already failed; keep order-level processing and persist error.
        } else if (willCall) {
          if (!willCallLoginOnly && !willCallInviteCode) {
            throw new Error("Invite code missing");
          }
          const message = willCallLoginOnly
            ? buildThankYouWillCallLoginEmail(emailContext)
            : buildThankYouWillCallEmail({
                ...emailContext,
                prefillToken: registrationPrefillToken,
              });
          const { subject, body } = message;
          const res = await sendEmail(email, subject, body);
          emailOk = res.ok && !res.skipped;
          if (res.skipped) {
            emailSkipped += 1;
            emailSkippedForOrder = true;
          }
          if (emailOk) {
            emailSent += 1;
          }
        } else if (!willCall) {
          const { subject, body } = deliveryUnderSixWeeks
            ? buildThankYouDeliveryUnder6WeeksEmail(row.orderNbr)
            : buildThankYouDeliveryEmail(row.orderNbr, row.deliveryDate);
          const res = await sendEmail(email, subject, body);
          emailOk = res.ok && !res.skipped;
          if (res.skipped) {
            emailSkipped += 1;
            emailSkippedForOrder = true;
          }
          if (emailOk) {
            emailSent += 1;
          }
        }
      } catch (err) {
        const message = String((err as Error)?.message || err);
        emailFailed += 1;
        emailErrorForOrder = message;
        errors.push(`email:${message}`);
      }
    } else {
      emailSkipped += 1;
      emailSkippedForOrder = true;
    }

    if (channelOutcomes.length < 25) {
      channelOutcomes.push({
        orderNbr: row.orderNbr,
        smsEligible,
        smsSent: smsOk,
        smsSkipped: smsSkippedForOrder,
        smsError: smsErrorForOrder,
        emailEligible,
        emailSent: emailOk,
        emailSkipped: emailSkippedForOrder,
        emailError: emailErrorForOrder,
      });
    }

    const updateBase = { ...upsertBase, lastAttemptAt: now };

    if (smsOk || emailOk) {
      sent += 1;
      await prisma.thankYouNotification.upsert({
        where: { orderNbr: row.orderNbr },
        create: {
          orderNbr: row.orderNbr,
          ...updateBase,
          smsSentAt: smsOk ? now : null,
          emailSentAt: emailOk ? now : null,
          firstSentAt: now,
          lastError: null,
        },
        update: {
          ...updateBase,
          smsSentAt: smsOk ? now : existing?.smsSentAt ?? null,
          emailSentAt: emailOk ? now : existing?.emailSentAt ?? null,
          firstSentAt: existing?.firstSentAt ?? now,
          lastError: null,
        },
      });
    } else {
      noteFail(errors.join(" | ") || "send failed");
      await prisma.thankYouNotification.upsert({
        where: { orderNbr: row.orderNbr },
        create: {
          orderNbr: row.orderNbr,
          ...updateBase,
          lastError: errors.join(" | ") || "send failed",
        },
        update: {
          ...updateBase,
          lastError: errors.join(" | ") || "send failed",
        },
      });
    }
  }

  return {
    ok: true,
    fetched: candidates.length,
    attempted,
    sent,
    skipped,
    failed,
    skipReasons,
    failedReasons,
    skippedOrders,
    channelCounts: {
      smsSent,
      smsSkipped,
      smsFailed,
      emailSent,
      emailSkipped,
      emailFailed,
    },
    channelOutcomes,
  };
}
