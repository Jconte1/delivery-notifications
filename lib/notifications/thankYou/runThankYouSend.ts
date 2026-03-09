import { prisma } from "@/lib/prisma";
import { fetchThankYouCandidates } from "@/lib/acumatica/fetch/fetchThankYouCandidates";
import { sendEmail } from "@/lib/notifications/providers/email/sendEmail";
import { sendSms } from "@/lib/notifications/providers/sms/sendSms";
import {
  buildThankYouDeliveryEmail,
  buildThankYouDeliverySms,
  buildThankYouWillCallEmail,
  buildThankYouWillCallSms,
} from "@/lib/notifications/templates/thankYou";
import { requestInviteCode } from "@/lib/invites/requestInviteCode";

const MIN_TURNIN_DATE = new Date("2026-04-15T00:00:00-06:00");

function normalizePhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function normalizeEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function isOpenStatus(status: string | null) {
  return String(status || "").toLowerCase() === "open";
}

function isWillCallShipVia(value: string | null) {
  const s = String(value || "").toLowerCase().trim();
  return s.includes("will");
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

    const smsPhone = normalizePhone(row.attributeSmsTxt);
    const email = normalizeEmail(row.attributeEmailNoty);
    const smsOptIn = row.attributeSmsOptIn === true;
    const emailOptIn = row.attributeEmailOptIn === true;
    const customerId = row.customerId ? String(row.customerId).trim() : "";
    const billingZip = row.billingZip ? String(row.billingZip).trim() : "";
    const upsertBase = {
      orderType: row.orderType ?? null,
      status: row.status ?? null,
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
    if (!row.turnInDate || row.turnInDate < MIN_TURNIN_DATE) {
      noteSkip(row.orderNbr, "turnInDate-before-min", row.shipVia);
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
    let smsOk = false;
    let emailOk = false;
    const errors: string[] = [];
    let smsSkippedForOrder = false;
    let emailSkippedForOrder = false;
    let smsErrorForOrder: string | null = null;
    let emailErrorForOrder: string | null = null;

    if (smsEligible && smsPhone) {
      try {
        const smsBody = willCall
          ? buildThankYouWillCallSms(row.orderNbr)
          : buildThankYouDeliverySms(row.orderNbr);
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
        if (willCall) {
          const inviteCode = await requestInviteCode({
            customerId,
            billingZip,
            email,
          });
          const { subject, body } = buildThankYouWillCallEmail(
            row.orderNbr,
            customerId,
            billingZip,
            inviteCode
          );
          const res = await sendEmail(email, subject, body);
          emailOk = res.ok && !res.skipped;
          if (res.skipped) {
            emailSkipped += 1;
            emailSkippedForOrder = true;
          }
          if (emailOk) {
            emailSent += 1;
          }
        } else {
          const { subject, body } = buildThankYouDeliveryEmail(row.orderNbr);
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
