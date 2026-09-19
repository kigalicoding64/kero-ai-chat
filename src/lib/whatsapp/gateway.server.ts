// Server-only. All WhatsApp Business calls go through the Lovable connector gateway;
// the connection credentials never reach the browser.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["WHATSAPP_API_KEY"];
  if (!lovable || !connection) {
    throw new Error("WhatsApp is not connected (missing gateway credentials).");
  }
  return { lovable, connection };
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["WHATSAPP_API_KEY"]);
}

/** Digits-only E.164 (no leading +), as the WhatsApp API expects. */
export function normalizePhone(input: string): string {
  return input.replace(/[^\d]/g, "");
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const { lovable, connection } = keys();
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": connection,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Sends a free-form text message. Only valid inside the 24h customer service window. */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const res = await gatewayFetch("/messages", {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body: body.slice(0, 4000) },
    }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 400)}` };
  try {
    const json = JSON.parse(text) as { messages?: { id?: string }[] };
    return { ok: true, id: json.messages?.[0]?.id ?? null };
  } catch {
    return { ok: true, id: null };
  }
}

/** The business number people should message, as displayed by Meta. */
export async function getBusinessNumber(): Promise<string | null> {
  try {
    const res = await gatewayFetch("/phone_number?fields=display_phone_number", { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json()) as { display_phone_number?: string };
    return json.display_phone_number ?? null;
  } catch {
    return null;
  }
}
