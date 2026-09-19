import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const phoneInput = z.object({
  phone: z.string().min(7).max(25),
  label: z.string().max(60).optional(),
});

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Public status: is WhatsApp connected, and which number should people message? */
export const whatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { whatsappConfigured, getBusinessNumber } = await import("@/lib/whatsapp/gateway.server");
    if (!whatsappConfigured()) return { configured: false, businessNumber: null as string | null };
    return { configured: true, businessNumber: await getBusinessNumber() };
  });

export const listWhatsappNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, phone_e164, label, verified, verified_at, auto_reply, verification_code, code_expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Creates (or refreshes) a pending number and returns the code the owner must send. */
export const requestWhatsappVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => phoneInput.parse(input))
  .handler(async ({ data, context }) => {
    const { normalizePhone } = await import("@/lib/whatsapp/gateway.server");
    const phone = normalizePhone(data.phone);
    if (phone.length < 8) throw new Error("Enter the full number including the country code.");

    const code = randomCode();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: existing } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, user_id, verified")
      .eq("phone_e164", phone)
      .maybeSingle();

    if (existing && existing.user_id !== context.userId) {
      throw new Error("That number is already linked to another account.");
    }

    if (existing) {
      const { error } = await context.supabase
        .from("whatsapp_numbers")
        .update({ verification_code: code, code_expires_at: expires, label: data.label ?? null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { phone, code, alreadyVerified: existing.verified };
    }

    const { error } = await context.supabase.from("whatsapp_numbers").insert({
      user_id: context.userId,
      phone_e164: phone,
      label: data.label ?? null,
      verification_code: code,
      code_expires_at: expires,
    });
    if (error) throw new Error(error.message);
    return { phone, code, alreadyVerified: false };
  });

export const setWhatsappAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), autoReply: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_numbers")
      .update({ auto_reply: data.autoReply })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("whatsapp_numbers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWhatsappThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_conversations")
      .select("id, contact_phone, contact_name, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listWhatsappMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("whatsapp_messages")
      .select("id, direction, content, status, error, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
