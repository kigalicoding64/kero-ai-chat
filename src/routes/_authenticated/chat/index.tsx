import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { KeroMark } from "@/components/kero/KeroMark";
import { createConversation, listConversations } from "@/lib/conversations.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const rows = await list();
      const target = rows[0] ?? (await create({ data: {} }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$conversationId", params: { conversationId: target.id }, replace: true });
    })();
  }, [create, list, navigate, queryClient]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <KeroMark className="size-12" />
      <p className="text-sm">Opening your workspace…</p>
    </div>
  );
}
