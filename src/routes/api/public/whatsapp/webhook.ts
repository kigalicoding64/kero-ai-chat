// Incoming WhatsApp callbacks from the Lovable connector gateway.
// Path is a contract: POST /api/public/whatsapp/webhook

import { createFileRoute } from "@tanstack/react-router";

interface WaValue {
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    audio?: { id?: string; mime_type?: string; voice?: boolean };
    image?: { caption?: string };
    video?: { caption?: string };
    document?: { caption?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  }[];
  statuses?: {
    id?: string;
    status?: string;
    timestamp?: string;
    errors?: { title?: string; message?: string }[];
  }[];
}

function waValue(payload: unknown): WaValue {
  const entry = (payload as { entry?: { changes?: { value?: WaValue }[] }[] })?.entry?.[0];
  return entry?.changes?.[0]?.value ?? {};
}

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("not configured", { status: 500 });

        const deliveryId = request.headers.get("x-lovable-delivery")?.trim();
        const event = request.headers.get("x-lovable-event")?.trim();
        if (!deliveryId || !event) return new Response("missing headers", { status: 400 });

        const { verifyWebhookRequest } = await import("@lovable.dev/webhooks-js");
        let payload: unknown;
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          });
          payload = verified.payload;
        } catch (error) {
          console.error("[whatsapp] signature verification failed", error);
          return new Response("invalid signature", { status: 401 });
        }

        if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
          console.warn("[whatsapp] privileged server key not set on this host; WhatsApp is handled by the Lovable-hosted app.");
          return new Response("whatsapp not available on this host", { status: 503 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Durable inbox first, deduplicated on the delivery id.
        const { data: existing } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select("id, processed_at")
          .eq("delivery_id", deliveryId)
          .maybeSingle();

        if (existing?.processed_at) return new Response("ok");

        if (!existing) {
          const { error } = await supabaseAdmin
            .from("whatsapp_webhook_events")
            .insert({ delivery_id: deliveryId, event, payload: payload as never });
          if (error && !error.message.includes("duplicate")) {
            console.error("[whatsapp] inbox write failed", error.message);
            return new Response("storage error", { status: 500 });
          }
        }

        try {
          if (event === "whatsapp.message") await handleInbound(supabaseAdmin, waValue(payload));
          else if (event === "whatsapp.status") await handleStatus(supabaseAdmin, waValue(payload));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[whatsapp] processing failed", message);
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({ processing_error: message.slice(0, 500) })
            .eq("delivery_id", deliveryId);
          return new Response("processing error", { status: 500 });
        }

        await supabaseAdmin
          .from("whatsapp_webhook_events")
          .update({ processed_at: new Date().toISOString(), processing_error: null })
          .eq("delivery_id", deliveryId);

        return new Response("ok");
      },
    },
  },
});

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

async function handleStatus(admin: Admin, value: WaValue) {
  for (const status of value.statuses ?? []) {
    if (!status.id || !status.status) continue;
    const { data: row } = await admin
      .from("whatsapp_messages")
      .select("id, status")
      .eq("wa_message_id", status.id)
      .maybeSingle();
    // A callback can arrive before the outbound row is saved; the stored event
    // keeps it durable and the next callback (or the send) reconciles it.
    if (!row) continue;
    const current = STATUS_RANK[row.status] ?? -1;
    const next = STATUS_RANK[status.status] ?? -1;
    if (next < current) continue;
    await admin
      .from("whatsapp_messages")
      .update({
        status: status.status,
        error: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? null,
        provider_timestamp: status.timestamp
          ? new Date(Number(status.timestamp) * 1000).toISOString()
          : null,
      })
      .eq("id", row.id);
  }
}

/** Natural pause before answering, so a person can finish typing their thought. */
const REPLY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleInbound(admin: Admin, value: WaValue) {
  const { sendWhatsAppText } = await import("@/lib/whatsapp/gateway.server");
  const { generateWhatsAppReply } = await import("@/lib/whatsapp/reply.server");
  const contactName = value.contacts?.[0]?.profile?.name ?? null;

  for (const message of value.messages ?? []) {
    const from = message.from;
    const waId = message.id;
    if (!from || !waId) continue;
    let text = (
      message.text?.body ??
      message.button?.text ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      message.image?.caption ?? message.video?.caption ?? message.document?.caption ?? ""
    ).trim();
    let voiceFailed = false;
    if (message.type === "audio" && message.audio?.id) {
      try {
        const { downloadWhatsAppMedia, transcribeVoiceNote } = await import("@/lib/whatsapp/voice.server");
        const transcript = await transcribeVoiceNote(await downloadWhatsAppMedia(message.audio.id));
        if (transcript) text = `[Voice note] ${transcript}`;
        else voiceFailed = true;
      } catch (error) {
        console.error("[whatsapp] voice note failed", error);
        voiceFailed = true;
      }
    }

    // Already handled (gateway retry or duplicate)?
    const { data: seen } = await admin
      .from("whatsapp_messages")
      .select("id, conversation_id, created_at")
      .eq("wa_message_id", waId)
      .maybeSingle();
    // A previous attempt may have been cut off before replying (gateway retry).
    // Only skip when a reply already exists after this message.
    let resumeRow: { id: string; created_at: string } | null = null;
    if (seen) {
      const { data: answered } = await admin
        .from("whatsapp_messages")
        .select("id")
        .eq("conversation_id", seen.conversation_id)
        .eq("direction", "outbound")
        .gte("created_at", seen.created_at)
        .limit(1);
      if ((answered ?? []).length > 0) continue;
      if (Date.now() - new Date(seen.created_at).getTime() > 10 * 60_000) continue;
      resumeRow = { id: seen.id, created_at: seen.created_at };
    }

    const { data: number } = await admin
      .from("whatsapp_numbers")
      .select("id, user_id, verified, auto_reply, verification_code, code_expires_at")
      .eq("phone_e164", from)
      .maybeSingle();

    // --- Ownership confirmation: the owner may send the 6-digit code at any time ---
    if (number && !number.verified) {
      const match = text.match(/(\d{6})/);
      const fresh =
        number.code_expires_at !== null && new Date(number.code_expires_at).getTime() > Date.now();
      if (match && fresh && match[1] === number.verification_code) {
        await admin
          .from("whatsapp_numbers")
          .update({
            verified: true,
            verified_at: new Date().toISOString(),
            verification_code: null,
            code_expires_at: null,
          })
          .eq("id", number.id);
        await sendWhatsAppText(
          from,
          "Your number is now confirmed. I'm here any time — day or night.",
        );
        continue;
      }
    }

    // Unknown sender writing to the official support line: still answer, but there is
    // no linked number to file the thread under, so reply without storing a thread.
    if (!number) {
      if (voiceFailed) {
        await sendWhatsAppText(from, "Sorry, I couldn't hear that voice note clearly. Could you send it again or type it?");
        continue;
      }
      if (!text) continue;
      await sleep(REPLY_DELAY_MS);
      try {
        const reply = await generateWhatsAppReply([{ role: "user", content: text }]);
        await sendWhatsAppText(from, reply);
      } catch (error) {
        console.error("[whatsapp] guest reply failed", error);
      }
      continue;
    }

    // --- Normal conversation ---
    let { data: thread } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("number_id", number.id)
      .eq("contact_phone", from)
      .maybeSingle();

    if (!thread) {
      const { data: created, error } = await admin
        .from("whatsapp_conversations")
        .insert({
          user_id: number.user_id,
          number_id: number.id,
          contact_phone: from,
          contact_name: contactName,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      thread = created;
    }

    const inserted = resumeRow ? { data: resumeRow, error: null } : await admin
      .from("whatsapp_messages")
      .insert({
        conversation_id: thread!.id,
        user_id: number.user_id,
        direction: "inbound",
        wa_message_id: waId,
        content: text || `[${message.type ?? "unsupported"} message]`,
        status: "received",
        provider_timestamp: message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : null,
      })
      .select("id, created_at")
      .single();
    const inboundRow = inserted.data;
    if (inserted.error) throw new Error(inserted.error.message);

    await admin
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString(), contact_name: contactName })
      .eq("id", thread!.id);

    if (!number.auto_reply) continue;
    if (!text) {
      await sendWhatsAppText(
        from,
        voiceFailed
          ? "Sorry, I couldn't hear that voice note clearly. Could you send it again or type it?"
          : "I can read text and voice notes. Could you tell me in a message what you need?",
      );
      continue;
    }

    // Wait a moment: if they keep typing, the newer message answers for both.
    await sleep(REPLY_DELAY_MS);
    const { data: newer } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", thread!.id)
      .eq("direction", "inbound")
      .gt("created_at", inboundRow!.created_at)
      .limit(1);
    if ((newer ?? []).length > 0) continue;

    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("direction, content")
      .eq("conversation_id", thread!.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const turns = (history ?? []).reverse().map((row) => ({
      role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: row.content,
    }));

    let reply: string;
    try {
      reply = await generateWhatsAppReply(turns);
    } catch (error) {
      console.error("[whatsapp] reply generation failed", error);
      reply = "Sorry, I couldn't get to that just now. Please send your message again in a moment.";
    }

    const sent = await sendWhatsAppText(from, reply);
    await admin.from("whatsapp_messages").insert({
      conversation_id: thread!.id,
      user_id: number.user_id,
      direction: "outbound",
      wa_message_id: sent.ok ? sent.id : null,
      content: reply,
      status: sent.ok ? "accepted" : "failed",
      error: sent.ok ? null : sent.error.slice(0, 500),
    });

    await admin
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread!.id);
  }
}

