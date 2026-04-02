import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getFrontendBase() {
  return (process.env.FRONTEND_URL || "https://mld-willcall.vercel.app").replace(/\/+$/, "");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const normalized = String(code || "").trim();
  if (!normalized || normalized.length < 6) {
    return NextResponse.json({ ok: false, error: "invalid-code" }, { status: 400 });
  }

  const row = await prisma.thankYouNotification.findFirst({
    where: { smsPrefillCode: normalized },
    select: {
      smsPrefillToken: true,
      smsPrefillExpiresAt: true,
    },
  });

  if (!row?.smsPrefillToken) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  if (row.smsPrefillExpiresAt && row.smsPrefillExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 410 });
  }

  const to = `${getFrontendBase()}/?register=1&prefillToken=${encodeURIComponent(row.smsPrefillToken)}`;
  return NextResponse.redirect(to, 302);
}

