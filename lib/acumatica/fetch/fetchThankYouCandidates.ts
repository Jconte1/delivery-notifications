import { queueErpJobRequest, shouldUseQueueErp } from "@/lib/queue/erpClient";

type AnyRow = Record<string, any>;
type QueueRowsResponse<T> = { rows?: T[] };

export type ThankYouCandidate = {
  orderNbr: string | null;
  orderType: string | null;
  status: string | null;
  customerName: string | null;
  locationName: string | null;
  attributeBuyerGroup: string | null;
  customerId: string | null;
  billingZip: string | null;
  shipVia: string | null;
  turnInDate: Date | null;
  attributeSiteNumber: string | null;
  attributeSmsTxt: string | null;
  attributeEmailNoty: string | null;
  attributeSmsOptIn: boolean | null;
  attributeEmailOptIn: boolean | null;
  attributeThankYou: boolean | null;
};

let loggedKeys = false;

function pickField(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    if (key in row && row[key] != null) return row[key];
  }
  return null;
}

function toDate(value: any) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toBool(value: any) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

export async function fetchThankYouCandidates() {
  let rows: AnyRow[] = [];
  if (shouldUseQueueErp()) {
    const resp = await queueErpJobRequest<QueueRowsResponse<AnyRow>>(
      "/api/erp/jobs/reports/thank-you",
      {}
    );
    rows = Array.isArray(resp?.rows) ? resp.rows : [];
  } else {
    const url =
      process.env.ACUMATICA_THANK_YOU_ODATA_URL ||
      "https://acumatica.mld.com/OData/MLD/Thank%20You%20Notifications";
    const username = process.env.ACUMATICA_USERNAME;
    const password = process.env.ACUMATICA_PASSWORD;

    if (!username || !password) {
      throw new Error("Missing ACUMATICA_USERNAME or ACUMATICA_PASSWORD env vars");
    }

    const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Thank-you OData fetch failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`);
    }

    const json = await res.json().catch(() => ({}));
    rows = Array.isArray(json) ? json : Array.isArray((json as any)?.value) ? (json as any).value : [];
  }

  if (!loggedKeys && rows.length) {
    loggedKeys = true;
    console.log("[thank-you] sample fields", Object.keys(rows[0] || {}).slice(0, 50));
  }

  return rows.map((row: AnyRow): ThankYouCandidate => ({
    orderNbr: pickField(row, ["OrderNbr", "SOOrder_OrderNbr", "SOOrder.OrderNbr"]),
    orderType: pickField(row, ["OrderType", "SOOrder_OrderType", "SOOrder.OrderType"]),
    status: pickField(row, ["Status", "SOOrder_Status", "SOOrder.Status"]),
    customerName: pickField(row, [
      "CustomerName",
      "CustomerID_Description",
      "SOOrder_CustomerID_Description",
      "SOOrder.CustomerID_Description",
    ]),
    locationName: pickField(row, [
      "LocationName",
      "CustomerLocationID_Description",
      "SOOrder_CustomerLocationID_Description",
      "SOOrder.CustomerLocationID_Description",
    ]),
    attributeBuyerGroup: pickField(row, [
      "AttributeBUYERGROUP",
      "SOOrder_AttributeBUYERGROUP",
      "SOOrder.AttributeBUYERGROUP",
    ]),
    customerId: pickField(row, ["CustomerID", "Customer", "SOOrder_CustomerID", "SOOrder.CustomerID"]),
    billingZip: pickField(row, [
      "PostalCode",
      "BillingZip",
      "SOOrder_BillingZip",
      "SOOrder.BillingZip",
    ]),
    shipVia: pickField(row, ["ShipVia", "SOOrder_ShipVia", "SOOrder.ShipVia"]),
    turnInDate: toDate(pickField(row, ["TurnInDate", "SOOrder_TurnInDate", "SOOrder.TurnInDate"])),
    attributeSiteNumber: pickField(row, [
      "DeliveryContactNumber",
      "DeliveryPhone",
      "AttributeSITENUMBER",
      "SOOrder_AttributeSITENUMBER",
      "SOOrder.AttributeSITENUMBER",
      "SOOrder_DeliveryPhone",
      "SOOrder.DeliveryPhone",
    ]),
    attributeSmsTxt: pickField(row, [
      "TextNotification",
      "AttributeSMSTXT",
      "SOOrder_AttributeSMSTXT",
      "SOOrder.AttributeSMSTXT",
      "DeliveryPhone",
      "SOOrder_DeliveryPhone",
      "SOOrder.DeliveryPhone",
    ]),
    attributeEmailNoty: pickField(row, [
      "EmailNotification",
      "AttributeEMAILNOTY",
      "SOOrder_AttributeEMAILNOTY",
      "SOOrder.AttributeEMAILNOTY",
    ]),
    attributeSmsOptIn: toBool(
      pickField(row, [
        "SMSOptin",
        "TextOptIn",
        "AttributeSMSOPTIN",
        "SOOrder_AttributeSMSOPTIN",
        "SOOrder.AttributeSMSOPTIN",
      ])
    ),
    attributeEmailOptIn: toBool(
      pickField(row, [
        "EmailOptin",
        "EmailOptIn",
        "AttributeEMAILOPTIN",
        "SOOrder_AttributeEMAILOPTIN",
        "SOOrder.AttributeEMAILOPTIN",
      ])
    ),
    attributeThankYou: toBool(
      pickField(row, [
        "ThankYou",
        "AttributeTHANKYOU",
        "SOOrder_AttributeTHANKYOU",
        "SOOrder.AttributeTHANKYOU",
      ])
    ),
  }));
}
