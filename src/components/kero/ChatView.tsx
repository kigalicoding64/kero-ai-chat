import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, RefreshCw, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "./Markdown";
import { KeroMark } from "./KeroMark";
import { AudioNoteRecorder } from "./AudioNoteRecorder";
import { ReadAloudButton } from "./ReadAloudButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { deleteMessagesFrom, renameConversation, saveMessage } from "@/lib/conversations.functions";

export interface UiMessage { id: string; role: "user" | "assistant"; content: string; isError?: boolean; createdAt?: string }
interface ChatViewProps { conversationId: string; initialMessages: UiMessage[]; title: string; onConversationChanged: () => void }
function parseSseChunk(buffer: string) { const parts = buffer.split("\n\n"); return { events: parts.slice(0, -1), rest: parts.at(-1) ?? "" }; }

export function ChatView({ conversationId, initialMessages, title, onConversationChanged }: ChatViewProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const save = useServerFn(saveMessage), rename = useServerFn(renameConversation), trimFrom = useServerFn(deleteMessagesFrom);

  const initialRef = useRef(initialMessages); initialRef.current = initialMessages;
  useEffect(() => { setMessages(initialRef.current); setInput(""); inputRef.current?.focus(); }, [conversationId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, streaming]);

  const runStream = useCallback(async (history: UiMessage[]) => {
    const controller = new AbortController(); abortRef.current = controller; setStreaming(true);
    const assistantId = `stream-${Date.now()}`; setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    let text = ""; let stoppedByUser = false;
    try {
      const body = JSON.stringify({ conversationId, messages: history.filter((m) => !m.isError && m.content.trim()).map((m) => ({ role: m.role, content: m.content })) });
      const post = (token: string) => fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, signal: controller.signal, body });
      let token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) token = (await supabase.auth.refreshSession()).data.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      let res = await post(token);
      if (res.status === 401) { const refreshed = await supabase.auth.refreshSession(); const retryToken = refreshed.data.session?.access_token; if (!retryToken) throw new Error("Your session expired. Please sign in again."); res = await post(retryToken); }
      if (!res.ok || !res.body) { const payload = await res.json().catch(() => null) as { message?: string } | null; throw new Error(payload?.message ?? `Kero could not answer (error ${res.status}).`); }
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = "", done = false;
      while (!done) { const chunk = await reader.read(); done = chunk.done; if (!chunk.value) continue; buffer += decoder.decode(chunk.value, { stream: true }); const parsed = parseSseChunk(buffer); buffer = parsed.rest; for (const event of parsed.events) for (const line of event.split("\n")) { if (!line.startsWith("data:")) continue; const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue; try { const delta = (JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content; if (delta) { text += delta; setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: text } : m)); } } catch { /* partial SSE frame */ } } }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError"; stoppedByUser = aborted;
      if (!aborted) { const message = error instanceof Error ? error.message : "Something went wrong."; toast.error(message); setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: message, isError: true } : m)); setStreaming(false); abortRef.current = null; return; }
    }
    setStreaming(false); abortRef.current = null;
    if (text.trim()) { try { const saved = await save({ data: { conversationId, role: "assistant", content: text } }); setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, id: saved.id, createdAt: saved.created_at } : m)); onConversationChanged(); } catch { toast.error("The reply could not be saved."); } }
    else if (stoppedByUser) setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    else setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "Kero did not send an answer this time. Please tap Regenerate.", isError: true } : m));
  }, [conversationId, onConversationChanged, save]);

  const handleSend = useCallback(async () => { const text = input.trim(); if (!text || streaming || pending) return; setInput(""); setPending(true); const optimistic = { id: `local-${Date.now()}`, role: "user" as const, content: text }; const history = [...messages, optimistic]; setMessages(history); try { const saved = await save({ data: { conversationId, role: "user", content: text } }); setMessages((prev) => prev.map((m) => m.id === optimistic.id ? { ...m, id: saved.id } : m)); if (title === "New chat") await rename({ data: { id: conversationId, title: text.slice(0, 60) } }); onConversationChanged(); } catch { toast.error("Your message could not be saved, but Kero will still answer."); } finally { setPending(false); } await runStream(history); }, [conversationId, input, messages, onConversationChanged, pending, rename, runStream, save, streaming, title]);
  const handleRegenerate = useCallback(async () => { if (streaming) return; const last = [...messages].reverse().find((m) => m.role === "assistant"); if (!last) return; const trimmed = messages.filter((m) => m.id !== last.id); setMessages(trimmed); if (last.createdAt) await trimFrom({ data: { conversationId, createdAtFrom: last.createdAt } }).catch(() => {}); await runStream(trimmed); }, [conversationId, messages, runStream, streaming, trimFrom]);
  const canRegenerate = !streaming && messages.some((m) => m.role === "assistant");

  return <div className="flex h-full min-h-0 flex-col"><div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">{messages.length === 0 && <div className="mt-16 flex flex-col items-center text-center"><KeroMark className="size-14 text-lg" /><h1 className="mt-5 font-display text-2xl font-semibold">How can Kero help?</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">Ask in English, Kinyarwanda, French or Swahili. Kero is the assistant of Egreed Technology.</p></div>}{messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{message.content}</div></div> : <div key={message.id} className="flex gap-3"><KeroMark className="mt-0.5 size-7 shrink-0" /><div className="min-w-0 flex-1">{message.isError ? <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{message.content}</p> : message.content ? <div className="space-y-1"><Markdown content={message.content} /><div className="flex items-center gap-1 pt-1"><ReadAloudButton text={message.content} /></div></div> : <span className="inline-block animate-pulse text-sm text-muted-foreground">Kero is thinking…</span>}</div></div>)}<div ref={bottomRef} /></div></div><div className="border-t border-border bg-background/80 backdrop-blur"><div className="mx-auto w-full max-w-3xl px-4 py-4"><div className="mb-2 flex items-center justify-end gap-2">{streaming ? <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}><Square className="size-3.5" /> Stop</Button> : canRegenerate ? <Button variant="ghost" size="sm" onClick={() => void handleRegenerate()}><RefreshCw className="size-3.5" /> Regenerate</Button> : null}</div><div className="relative rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/60"><Textarea ref={inputRef} value={input} autoFocus onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Message Kero or dictate a voice note…" rows={1} className={cn("max-h-48 min-h-11 resize-none border-0 bg-transparent pr-20 text-sm shadow-none", "focus-visible:ring-0")} /><div className="absolute bottom-2.5 right-2.5 flex items-center gap-1"><AudioNoteRecorder disabled={streaming || pending} onTranscribed={(text) => { setInput((prev) => prev ? `${prev} ${text}` : text); inputRef.current?.focus(); }} /><Button size="icon" className="size-8 rounded-full" disabled={!input.trim() || streaming} onClick={() => void handleSend()} aria-label="Send message"><ArrowUp className="size-4" /></Button></div></div><p className="mt-2 text-center text-xs text-muted-foreground">Kero can make mistakes. Check important information.</p></div></div></div>;
}
