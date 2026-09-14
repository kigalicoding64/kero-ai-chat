import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ChatView, type UiMessage } from "@/components/kero/ChatView";
import { getMessages, listConversations } from "@/lib/conversations.functions";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchMessages = useServerFn(getMessages);
  const list = useServerFn(listConversations);

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId } }),
  });

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => list(),
  });

  if (messages.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  if (messages.isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        This conversation could not be opened.
      </div>
    );
  }

  const initial: UiMessage[] = (messages.data ?? [])
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      isError: row.is_error,
      createdAt: row.created_at,
    }));

  const title = conversations.data?.find((row) => row.id === conversationId)?.title ?? "New chat";

  return (
    <ChatView
      key={conversationId}
      conversationId={conversationId}
      initialMessages={initial}
      title={title}
      onConversationChanged={() => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }}
    />
  );
}
