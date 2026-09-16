import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";
import { createConversation, listConversations } from "@/lib/conversations.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

const OPEN_TIMEOUT_MS = 15_000;

function ChatIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setError(null);
    try {
      const rows = await Promise.race([
        list(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), OPEN_TIMEOUT_MS),
        ),
      ]);
      const target = rows[0] ?? (await create({ data: {} }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$conversationId", params: { conversationId: target.id }, replace: true });
    } catch (err) {
      const timedOut = err instanceof Error && err.message === "timeout";
      setError(
        timedOut
          ? "The Kero backend did not respond. Check this deployment's configuration and try again."
          : "Your conversations could not be loaded. Please try again.",
      );
    }
  }, [create, list, navigate, queryClient]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, [open]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <KeroMark className="size-12" />
      {error ? (
        <>
          <p className="max-w-sm text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void open()}>
            <RefreshCw className="size-3.5" /> Try again
          </Button>
        </>
      ) : (
        <p className="text-sm">Opening your workspace…</p>
      )}
    </div>
  );
}
