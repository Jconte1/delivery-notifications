import { prisma } from "@/lib/prisma";
import { getDenverParts } from "@/lib/time/denver";
import { queueErpRequest, shouldUseQueueErp } from "@/lib/queue/erpClient";

type QueueJobSubmitResponse = {
  jobId: string;
};

type QueueJobStatusResponse<T> = {
  status: "queued" | "processing" | "succeeded" | "failed";
  result?: T;
  error?: string | null;
};

type QueueWriteResult = {
  ok?: boolean;
  orderNbr?: string;
  orderType?: string | null;
};

function denverDateKey(date: Date) {
  return getDenverParts(date).date;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitAndWaitForWriteJob(orderNbr: string, orderType: string | null) {
  const timeoutMs = Number(process.env.MLD_QUEUE_JOB_POLL_TIMEOUT_MS || 285000);
  const pollIntervalMs = Number(process.env.MLD_QUEUE_JOB_POLL_INTERVAL_MS || 300);
  const startedAt = Date.now();

  const submit = await queueErpRequest<QueueJobSubmitResponse>("/api/erp/jobs/thank-you/mark-sent", {
    method: "POST",
    body: { orderNbr, orderType },
    timeoutMs,
  });

  if (!submit.jobId) {
    throw new Error("Queue submit missing jobId");
  }

  while (Date.now() - startedAt < timeoutMs) {
    const status = await queueErpRequest<QueueJobStatusResponse<QueueWriteResult>>(
      `/api/erp/jobs/${submit.jobId}`,
      {
        method: "GET",
        timeoutMs,
      }
    );
    if (status.status === "succeeded") {
      return { jobId: submit.jobId, result: status.result ?? {} };
    }
    if (status.status === "failed") {
      throw new Error(
        `Queue job failed jobId=${submit.jobId} error=${status.error || "unknown"}`
      );
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Queue job timeout jobId=${submit.jobId} timeoutMs=${timeoutMs}`);
}

export async function runThankYouSync() {
  if (!shouldUseQueueErp()) {
    throw new Error("USE_QUEUE_ERP must be enabled for thank-you sync writes");
  }

  const now = new Date();
  const todayKey = denverDateKey(now);

  const rows = await prisma.thankYouNotification.findMany({
    where: { firstSentAt: { not: null }, acumaticaUpdatedAt: null },
    select: {
      orderNbr: true,
      orderType: true,
      firstSentAt: true,
      acumaticaUpdateAttempts: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const eligible = rows.filter((row) => row.firstSentAt && denverDateKey(row.firstSentAt) === todayKey);
  const skippedHistorical = rows.length - eligible.length;

  let updated = 0;
  let failed = 0;
  const failedReasons: Record<string, number> = {};

  function noteFailure(reason: string) {
    failed += 1;
    failedReasons[reason] = (failedReasons[reason] || 0) + 1;
  }

  for (const row of eligible) {
    const orderNbr = row.orderNbr;
    const orderTypeRaw = String(row.orderType || "").trim().toUpperCase();
    const orderType = orderTypeRaw || null;
    const startedAt = new Date();

    try {
      const write = await submitAndWaitForWriteJob(orderNbr, orderType);

      await prisma.thankYouNotification.update({
        where: { orderNbr },
        data: {
          acumaticaUpdatedAt: new Date(),
          acumaticaUpdateError: null,
          acumaticaLastAttemptAt: startedAt,
          acumaticaUpdateAttempts: (row.acumaticaUpdateAttempts || 0) + 1,
          acumaticaLastJobId: write.jobId,
        },
      });

      updated += 1;
      console.log("[thank-you-sync] order updated", { orderNbr, orderType, jobId: write.jobId });
    } catch (err) {
      const message = String((err as Error)?.message || err || "unknown-error");
      await prisma.thankYouNotification.update({
        where: { orderNbr },
        data: {
          acumaticaUpdateError: message,
          acumaticaLastAttemptAt: startedAt,
          acumaticaUpdateAttempts: (row.acumaticaUpdateAttempts || 0) + 1,
        },
      });
      noteFailure(message.includes("timeout") ? "queue-timeout" : "queue-write-failed");
      console.error("[thank-you-sync] order failed", { orderNbr, orderType, error: message });
    }
  }

  const result = {
    ok: true,
    totalPending: rows.length,
    eligibleToday: eligible.length,
    skippedHistorical,
    updated,
    failed,
    failedReasons,
  };

  console.log("[thank-you-sync] summary", result);
  return result;
}
