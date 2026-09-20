import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LogOut,
  MessageSquarePlus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { createConversation, deleteConversation, listConversations } from "@/lib/conversations.functions";
import { ConnectionBadge } from "@/components/kero/ConnectionBadge";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Kero AI — Egreed Technology assistant" },
      {
        name: "description",
        content:
          "Chat with Kero, the Egreed Technology AI assistant, in English, Kinyarwanda, French or Swahili.",
      },
      { property: "og:title", content: "Kero AI — Egreed Technology assistant" },
      {
        property: "og:description",
        content: "Multilingual AI assistant for Egreed Technology, powered by NVIDIA NIM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatLayout,
});

function ChatLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const params = useParams({ strict: false }) as { conversationId?: string };

  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const remove = useServerFn(deleteConversation);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => list(),
  });


  const newChat = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$conversationId", params: { conversationId: row.id } });
    },
    onError: () => toast.error("Could not start a new chat."),
  });

  const deleteChat = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async (_result, id) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (params.conversationId === id) navigate({ to: "/chat" });
    },
    onError: () => toast.error("Could not delete that conversation."),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = conversations.data ?? [];
    if (!term) return rows;
    return rows.filter((row) => row.title.toLowerCase().includes(term));
  }, [conversations.data, search]);

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <KeroMark className="size-9" />
          <div>
            <p className="font-display text-sm font-semibold leading-tight">Kero AI</p>
            <p className="text-xs text-muted-foreground">Egreed Technology</p>
          </div>
        </div>

        <div className="px-3">
          <Button className="w-full justify-start" onClick={() => newChat.mutate()} disabled={newChat.isPending}>
            <MessageSquarePlus className="size-4" /> New chat
          </Button>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="pl-9"
            />
          </div>
        </div>

        <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {conversations.isLoading && <p className="px-2 text-xs text-muted-foreground">Loading…</p>}
          {!conversations.isLoading && filtered.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">No conversations yet.</p>
          )}
          {filtered.map((row) => (
            <div
              key={row.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-1 transition",
                params.conversationId === row.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
              )}
            >
              <Link
                to="/chat/$conversationId"
                params={{ conversationId: row.id }}
                className="min-w-0 flex-1 truncate px-2 py-2 text-sm"
              >
                {row.title}
              </Link>
              <button
                type="button"
                aria-label={`Delete ${row.title}`}
                onClick={() => deleteChat.mutate(row.id)}
                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
          <ConnectionBadge />
          <Link
            to="/whatsapp"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <MessageCircle className="size-4" /> Kero on WhatsApp
          </Link>
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings2 className="size-4" /> Settings & diagnostics
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
