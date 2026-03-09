type SmsResult = { ok: boolean; skipped?: boolean };

function resolveRecipient(phone: string) {
  const testPhone = process.env.NOTIFICATIONS_TEST_PHONE || "";
  if (testPhone) {
    return testPhone;
  }
  return phone;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  const recipient = resolveRecipient(to);

  if (!recipient) {
    return { ok: true, skipped: true };
  }
  if (!accountSid || !authToken || !from) {
    return { ok: true, skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.set("To", recipient);
  params.set("From", from);
  params.set("Body", body);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Twilio SMS failed: ${resp.status} ${text}`);
  }

  return { ok: true };
}
