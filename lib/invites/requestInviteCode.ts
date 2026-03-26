type InviteResponse = {
  ok: boolean;
  code?: string;
  message?: string;
};

export type InviteDispatchResult =
  | { kind: "invite"; code: string }
  | { kind: "existing-account" };

export async function requestInviteCode(input: {
  customerId: string;
  billingZip: string;
  email: string;
}): Promise<InviteDispatchResult> {
  const baseUrl = (process.env.WILLCALL_BACKEND_URL || "").replace(/\/$/, "");
  const token = process.env.WILLCALL_INVITE_TOKEN || "";
  if (!baseUrl || !token) {
    throw new Error("Missing WILLCALL_BACKEND_URL or WILLCALL_INVITE_TOKEN");
  }

  const res = await fetch(`${baseUrl}/api/internal/invites/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId: input.customerId,
      billingZip: input.billingZip,
      email: input.email,
      sendEmail: false,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as InviteResponse;

  if (res.status === 409) {
    const message = String(data?.message || "").toLowerCase();
    if (message.includes("already exists")) {
      return { kind: "existing-account" };
    }
  }

  if (!res.ok || !data?.code) {
    throw new Error(data?.code ? "Invite dispatch failed" : "Invite code missing");
  }

  return { kind: "invite", code: data.code };
}
