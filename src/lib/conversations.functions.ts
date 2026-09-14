import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const idInput = z.object({ id: z.string().uuid() });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ title: z.string().max(120).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert({ user_id: context.userId, title: data.title ?? "New chat" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, content, model, is_error, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string().max(60000),
        model: z.string().max(200).optional(),
        isError: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const insert: Record<string, unknown> = {
      conversation_id: data.conversationId,
      user_id: context.userId,
      role: data.role,
      content: data.content,
      is_error: data.isError ?? false,
    };
    if (data.model) insert["model"] = data.model;

    const { data: row, error } = await context.supabase
      .from("messages")
      .insert(insert as never)
      .select("id, role, content, model, is_error, created_at")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return row;
  });

export const deleteMessagesFrom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), createdAtFrom: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messages")
      .delete()
      .eq("conversation_id", data.conversationId)
      .gte("created_at", data.createdAtFrom);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
