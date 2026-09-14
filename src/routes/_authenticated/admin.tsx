import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, Play, TriangleAlert } from "lucide-react";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";
import { getProviderStatus, listAuditLogs, runConnectionTest } from "@/lib/diagnostics.functions";
import type { CheckResult } from "@/lib/ai/types";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Kero diagnostics — Egreed Technology" },
      {
        name: "description",
        content: "Verify Kero's NVIDIA connection: API key, reachability, model availability and a live reply test.",
      },
      { property: "og:title", content: "Kero diagnostics — Egreed Technology" },
      {
        property: "og:description",
        content: "Connection test panel for the Kero AI assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function StatusIcon({ status }: { status: CheckResult["status"] }) {
  if (status === "pass") return <CircleCheck className="size-5 text-primary" />;
  if (status === "warn") return <TriangleAlert className="size-5 text-amber-500" />;
  return <CircleAlert className="size-5 text-destructive" />;
}

function AdminPage() {
  const status = useServerFn(getProviderStatus);
  const test = useServerFn(runConnectionTest);
  const logs = useServerFn(listAuditLogs);

  const providerStatus = useQuery({ queryKey: ["provider-status"], queryFn: () => status() });
  const auditLogs = useQuery({ queryKey: ["audit-logs"], queryFn: () => logs() });
  const runTest = useMutation({
    mutationFn: () => test(),
    onSuccess: () => auditLogs.refetch(),
  });

  const configured = providerStatus.data?.configured;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <Link to="/chat" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to chat
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <KeroMark className="size-11" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Connection diagnostics</h1>
            <p className="text-sm text-muted-foreground">
              Provider: {providerStatus.data?.label ?? "…"} · Model: {providerStatus.data?.model ?? "…"}
            </p>
          </div>
        </div>

        {configured === false && (
          <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Kero is not connected yet</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Create an API key at build.nvidia.com (it starts with “nvapi-”).</li>
              <li>Save it in this project as the secret named NVIDIA_API_KEY.</li>
              <li>Optionally set NVIDIA_MODEL to choose a specific model.</li>
              <li>Publish the app so the live site picks up the key.</li>
            </ol>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Run the full test</h2>
              <p className="text-sm text-muted-foreground">
                Checks the key, reachability, model availability and a real reply.
              </p>
            </div>
            <Button onClick={() => runTest.mutate()} disabled={runTest.isPending}>
              <Play className="size-4" /> {runTest.isPending ? "Testing…" : "Run test"}
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {runTest.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleDashed className="size-4 animate-spin" /> Contacting NVIDIA…
              </p>
            )}
            {runTest.isError && (
              <p className="text-sm text-destructive">The test could not be completed. Please try again.</p>
            )}
            {runTest.data?.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <StatusIcon status={check.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="break-words text-sm text-muted-foreground">{check.detail}</p>
                  {check.durationMs !== undefined && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{check.durationMs} ms</p>
                  )}
                </div>
              </div>
            ))}
            {runTest.data && (
              <p className={runTest.data.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
                {runTest.data.ok ? "All checks passed — Kero is ready." : "One or more checks failed."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(auditLogs.data ?? []).length === 0 && (
              <li className="text-muted-foreground">No activity recorded yet.</li>
            )}
            {(auditLogs.data ?? []).map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                <span>{log.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
