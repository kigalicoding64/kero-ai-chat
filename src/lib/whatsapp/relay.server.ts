// EGREED hotel staff relay: staff commands are answered by EGREED, everything else falls through to Kero AI.
// Tries the Lovable-hosted relay first, then the Vercel one, then falls back to Kero AI.
const LOVABLE_RELAY_URL = "https://egreed-hostel-os.lovable.app/api/public/whatsapp/relay";
const VERCEL_RELAY_URL = "https://egreed-hostel-os.vercel.app/api/public/whatsapp/relay";
const PER_RELAY_TIMEOUT_MS = 2000;

type RelayResult = { handled: boolean; reply?: string };

function relayUrls(): string[] {
  const custom = process.env["EGREED_RELAY_URL"];
  return [...new Set([custom || LOVABLE_RELAY_URL, LOVABLE_RELAY_URL, VERCEL_RELAY_URL])];
}

async function tryRelay(url: string, phone: string, text: string, secret: string): Promise<RelayResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_RELAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": secret },
      body: JSON.stringify({ phone, text }),
      signal: controller.signal,
    });
    if (res.status !== 200) {
      console.warn("[EGREED Relay]", url, "status", res.status);
      return null; // try next relay
    }
    const data = (await res.json()) as { handled?: boolean; reply?: string; error?: string };
    if (data.error) console.warn("[EGREED Relay]", url, "reported error:", data.error);
    if (data.handled === true && typeof data.reply === "string" && data.reply.trim()) {
      return { handled: true, reply: data.reply };
    }
    return { handled: false }; // relay working, not a staff command
  } catch (err) {
    console.warn("[EGREED Relay]", url, "error or timeout:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkStaffRelay(phone: string, text: string): Promise<RelayResult> {
  const secret = process.env["EGREED_RELAY_SECRET"] || "";
  if (!secret) {
    console.warn("[EGREED Relay] Relay authentication is not configured; using Kero instead.");
    return { handled: false };
  }
  for (const url of relayUrls()) {
    const result = await tryRelay(url, phone, text, secret);
    if (result) return result;
  }
  return { handled: false };
}
