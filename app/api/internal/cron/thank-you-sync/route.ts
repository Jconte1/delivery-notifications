import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { shouldRunDailyJob, markJobRun } from "@/lib/cron/jobState";
import { runThankYouSync } from "@/lib/notifications/thankYou/runThankYouSync";

export const runtime = "nodejs";

const JOB_NAME = "thank-you-sync";
const TARGET_HOUR = 18;
const TARGET_MINUTE = 30;

async function runCron(req: Request) {
  const { searchParams } = new URL(req.url);
  if (!isCronAuthorized(req, searchParams)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { shouldRun, now } = await shouldRunDailyJob(
    JOB_NAME,
    TARGET_HOUR,
    TARGET_MINUTE
  );
  if (!shouldRun) {
    return NextResponse.json({ ok: true, skipped: "not-time" });
  }

  const result = await runThankYouSync();
  await markJobRun(JOB_NAME, now);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}
