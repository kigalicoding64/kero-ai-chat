// EGREED hotel staff relay: staff commands are answered by EGREED, everything else falls through to Kero AI.
const DEFAULT_RELAY_URL = "https://egreed-hostel-os.vercel.app/api/public/whatsapp/relay";

export async function checkStaffRelay(
  phone: string,
  text: string,
): Promise<{ handled: boolean; reply?: string }> {
  const url = process.env["EGREED_RELAY_URL"] || DEFAULT_RELAY_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Host": new URL(url).host },
      body: JSON.stringify({ phone, text }),
      signal: controller.signal,
    });
    if (!res.ok) return { handled: false };
    const data = (await res.json()) as { handled?: boolean; reply?: string };
    if (data.handled && typeof data.reply === "string" && data.reply.trim()) {
      return { handled: true, reply: data.reply };
    }
    return { handled: false };
  } catch (err) {
    console.warn("[EGREED Relay] Error or timeout, falling back to AI:", err);
    return { handled: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
