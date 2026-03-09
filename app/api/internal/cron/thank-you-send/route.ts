import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { shouldRunDailyJob, markJobRun } from "@/lib/cron/jobState";
import { runThankYouSend } from "@/lib/notifications/thankYou/runThankYouSend";

export const runtime = "nodejs";

const JOB_NAME = "thank-you-send";
const TARGET_HOUR = 10;
const TARGET_MINUTE = 0;

async function runCron(req: Request) {
  const { searchParams } = new URL(req.url);
  if (!isCronAuthorized(req, searchParams)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const forceRun = searchParams.get("force") === "1";
  const { shouldRun, now } = await shouldRunDailyJob(
    JOB_NAME,
    TARGET_HOUR,
    TARGET_MINUTE
  );
  if (!forceRun && !shouldRun) {
    return NextResponse.json({ ok: true, skipped: "not-time" });
  }

  const result = await runThankYouSend();
  if (!forceRun) {
    await markJobRun(JOB_NAME, now);
  }
  return NextResponse.json({ ...result, forced: forceRun || undefined });
}

export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}
