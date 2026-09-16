import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { HEALTH_ENDPOINT, HEALTH_TIMEOUT_MS } from "@/lib/runtime-config";

type State =
  | "checking"
  | "connected"
  | "degraded"
  | "offline"
  | "backend_error"
  | "provider_error"
  | "timeout";

interface HealthPayload {
  status?: "connected" | "degraded" | "error";
  provider?: string;
  backend?: "ok" | "misconfigured";
  reason?: string;
}

const LABELS: Record<State, string> = {
  checking: "Checking connection…",
  connected: "Kero backend connected",
  degraded: "AI service degraded",
  offline: "No connection to Kero",
  backend_error: "Backend configuration error",
  provider_error: "AI provider unavailable",
  timeout: "Connection check timed out",
};

export function ConnectionBadge() {
  const [state, setState] = useState<State>("checking");
  const [reason, setReason] = useState<string | undefined>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(async () => {
    setState("checking");
    setReason(undefined);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(HEALTH_ENDPOINT, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      const payload = (await res.json().catch(() => null)) as HealthPayload | null;
      if (!mounted.current) return;
      if (!payload) {
        setState("backend_error");
        setReason("The Kero backend did not return a valid response.");
        return;
      }
      if (payload.backend === "misconfigured") {
        setState("backend_error");
      } else if (payload.status === "connected") {
        setState("connected");
      } else if (payload.status === "degraded") {
        setState("degraded");
      } else {
        setState("provider_error");
      }
      setReason(payload.reason);
    } catch (error) {
      if (!mounted.current) return;
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setState(aborted ? "timeout" : "offline");
      setReason(
        aborted
          ? "The check took too long. The deployment may be missing its configuration."
          : "The Kero backend could not be reached from this deployment.",
      );
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const icon =
    state === "checking" ? (
      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
    ) : state === "connected" ? (
      <CircleCheck className="size-4 shrink-0 text-primary" />
    ) : state === "degraded" ? (
      <TriangleAlert className="size-4 shrink-0 text-amber-400" />
    ) : (
      <CircleAlert className="size-4 shrink-0 text-destructive" />
    );

  return (
    <div className="px-2 py-1 text-xs">
      <div className="flex items-center gap-2">
        {icon}
        <span className="truncate text-muted-foreground">{LABELS[state]}</span>
        {state !== "checking" && state !== "connected" && (
          <button
            type="button"
            onClick={() => void check()}
            className="ml-auto rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Retry connection check"
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
      </div>
      {reason && state !== "connected" && (
        <p className="mt-1 pl-6 text-[11px] leading-snug text-muted-foreground">{reason}</p>
      )}
    </div>
  );
}
