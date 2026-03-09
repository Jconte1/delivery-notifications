import { prisma } from "@/lib/prisma";
import { getDenverParts, hasReachedTime } from "@/lib/time/denver";

export async function shouldRunDailyJob(name: string, targetHour: number, targetMinute: number) {
  const now = new Date();
  if (!hasReachedTime(now, targetHour, targetMinute)) return { shouldRun: false, now };

  const state = await prisma.jobState.findUnique({ where: { name } });
  if (!state?.lastRunAt) return { shouldRun: true, now };

  const last = getDenverParts(state.lastRunAt);
  const cur = getDenverParts(now);
  return { shouldRun: last.date !== cur.date, now };
}

export async function markJobRun(name: string, when: Date) {
  await prisma.jobState.upsert({
    where: { name },
    update: { lastRunAt: when },
    create: { name, lastRunAt: when },
  });
}
