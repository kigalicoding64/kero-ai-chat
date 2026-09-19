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

async function handleInbound(admin: Admin, value: WaValue) {
  const { sendWhatsAppText } = await import("@/lib/whatsapp/gateway.server");
  const { generateWhatsAppReply } = await import("@/lib/whatsapp/reply.server");
  const contactName = value.contacts?.[0]?.profile?.name ?? null;

  for (const message of value.messages ?? []) {
    const from = message.from;
    const waId = message.id;
    const text = message.text?.body?.trim() ?? "";
    if (!from || !waId) continue;

    // Already handled (gateway retry or duplicate)?
    const { data: seen } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_message_id", waId)
      .maybeSingle();
    if (seen) continue;

    const { data: number } = await admin
      .from("whatsapp_numbers")
      .select("id, user_id, verified, auto_reply, verification_code, code_expires_at")
      .eq("phone_e164", from)
      .maybeSingle();

    if (!number) continue; // unknown sender: stored in the inbox, nothing else to do

    // --- Verification step: the owner sends the code from their own WhatsApp ---
    if (!number.verified) {
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
          "Your number is now linked to Kero. Message me any time — I answer day and night.",
        );
      } else {
        await sendWhatsAppText(
          from,
          "This number is not verified yet. Send the 6-digit code shown in Kero to finish linking it.",
        );
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

    const { error: insertError } = await admin.from("whatsapp_messages").insert({
      conversation_id: thread!.id,
      user_id: number.user_id,
      direction: "inbound",
      wa_message_id: waId,
      content: text || `[${message.type ?? "unsupported"} message]`,
      status: "received",
      provider_timestamp: message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : null,
    });
    if (insertError) throw new Error(insertError.message);

    await admin
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString(), contact_name: contactName })
      .eq("id", thread!.id);

    if (!number.auto_reply) continue;
    if (!text) {
      await sendWhatsAppText(from, "I can only read text messages for now.");
      continue;
    }

    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("direction, content")
      .eq("conversation_id", thread!.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const turns = (history ?? [])
      .reverse()
      .map((row) => ({
        role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: row.content,
      }));

    let reply: string;
    try {
      reply = await generateWhatsAppReply(turns);
    } catch (error) {
      console.error("[whatsapp] reply generation failed", error);
      reply = "Kero is temporarily unavailable. Please send your message again shortly.";
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
