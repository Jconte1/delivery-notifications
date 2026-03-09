import { prisma } from "@/lib/prisma";
import { createAcumaticaService } from "@/lib/acumatica/createAcumaticaService";
import { updateThankYouFlag } from "@/lib/acumatica/write/updateThankYouFlag";

export async function runThankYouSync() {
  const restService = createAcumaticaService();
  const rows = await prisma.thankYouNotification.findMany({
    where: { firstSentAt: { not: null }, acumaticaUpdatedAt: null },
    select: { orderNbr: true, orderType: true },
  });

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await updateThankYouFlag(restService, {
        orderNbr: row.orderNbr,
        orderType: row.orderType,
      });
      updated += 1;
      await prisma.thankYouNotification.update({
        where: { orderNbr: row.orderNbr },
        data: { acumaticaUpdatedAt: new Date(), acumaticaUpdateError: null },
      });
    } catch (err) {
      failed += 1;
      await prisma.thankYouNotification.update({
        where: { orderNbr: row.orderNbr },
        data: { acumaticaUpdateError: String((err as Error)?.message || err) },
      });
    }
  }

  return { ok: true, total: rows.length, updated, failed };
}
