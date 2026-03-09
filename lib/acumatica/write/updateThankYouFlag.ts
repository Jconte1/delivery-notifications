export async function updateThankYouFlag(
  restService: { baseUrl: string; getToken: () => Promise<string> },
  { orderNbr, orderType }: { orderNbr: string; orderType?: string | null }
) {
  const token = await restService.getToken();
  const url = `${restService.baseUrl}/entity/CustomEndpoint/24.200.001/SalesOrder`;

  const payload: Record<string, any> = {
    OrderNbr: { value: orderNbr },
  };
  if (orderType) {
    payload.OrderType = { value: orderType };
  }

  payload.custom = {
    Document: {
      AttributeTHANKYOU: { value: true },
    },
  };

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Acumatica THANKYOU update failed: ${resp.status} ${text}`);
  }

  return resp.json().catch(() => ({}));
}
