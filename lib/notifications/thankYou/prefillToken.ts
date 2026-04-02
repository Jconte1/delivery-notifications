import crypto from "node:crypto";

type PrefillPayload = {
  p: "willcall-register-prefill";
  b: string; // BAID
  z: string; // ZIP
  i: string; // invite code
  e?: string | null; // email
  o?: string | null; // order number
  exp: number; // unix seconds
};

function getSecret() {
  const secret = process.env.WILLCALL_SMS_PREFILL_SECRET || "";
  if (!secret) {
    throw new Error("WILLCALL_SMS_PREFILL_SECRET is not configured");
  }
  return secret;
}

function base64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function createRegistrationPrefillToken(input: {
  customerId: string;
  billingZip: string;
  inviteCode: string;
  email?: string | null;
  orderNbr?: string | null;
}) {
  const secret = getSecret();
  const ttlHours = Math.max(1, Number(process.env.WILLCALL_SMS_PREFILL_TTL_HOURS || 24));
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: PrefillPayload = {
    p: "willcall-register-prefill",
    b: String(input.customerId || "").trim().toUpperCase(),
    z: String(input.billingZip || "").replace(/\D/g, "").slice(0, 5),
    i: String(input.inviteCode || "").trim(),
    e: input.email ? String(input.email).trim().toLowerCase() : null,
    o: input.orderNbr ? String(input.orderNbr).trim().toUpperCase() : null,
    exp: nowSec + ttlHours * 60 * 60,
  };

  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

