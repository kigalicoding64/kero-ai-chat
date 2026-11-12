import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyzeFailedCommand, runLiveChecks } from "@/lib/staff-help.functions";

export function StaffTools() {
  const analyze = useMutation({ mutationFn: useServerFn(analyzeFailedCommand) });
  const live = useMutation({ mutationFn: useServerFn(runLiveChecks) });
  const [command, setCommand] = useState("Login"), [phone, setPhone] = useState(""), [note, setNote] = useState("");
  const [place, setPlace] = useState("Kigali"), [topic, setTopic] = useState("Rwanda");
  return (
    <>
      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Failed staff command helper</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enter the command that got no hotel answer. Kero tests the hotel connection and suggests fixes.</p>
        <form className="mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); analyze.mutate({ data: { command, phone, note } }); }}>
          <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Command, e.g. rooms" aria-label="Command" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Staff WhatsApp number, e.g. 250795822290" aria-label="Staff phone" />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (optional)" aria-label="Note" />
          <Button type="submit" disabled={analyze.isPending}>{analyze.isPending ? "Checking…" : "Analyze failure"}</Button>
        </form>
        {analyze.isError && <p className="mt-3 text-sm text-destructive">{analyze.error.message}</p>}
        {analyze.data && (
          <div className="mt-4 space-y-3 text-sm">
            {analyze.data.probes.map((p) => (
              <div key={p.url} className="rounded-lg border border-border p-3">
                <p className="font-medium">{new URL(p.url).hostname} — {p.status ? `status ${p.status}` : "no response"} {p.ms ? `(${p.ms} ms)` : ""}</p>
                <p className="mt-1 break-words text-muted-foreground">{p.detail}</p>
              </div>
            ))}
            {analyze.data.error ? <p className="text-destructive">{analyze.data.error}</p> : <div className="whitespace-pre-wrap rounded-lg bg-muted p-3">{analyze.data.advice}</div>}
          </div>
        )}
      </section>
      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Live news & weather check</h2>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); live.mutate({ data: { place, topic } }); }}>
          <Input className="flex-1" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Weather place" />
          <Input className="flex-1" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="News topic" />
          <Button type="submit" disabled={live.isPending}>{live.isPending ? "Fetching…" : "Run live check"}</Button>
        </form>
        {live.isError && <p className="mt-3 text-sm text-destructive">{live.error.message}</p>}
        {live.data && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-muted-foreground">Fetched {new Date(live.data.fetchedAt).toLocaleString()}</p>
            <h3 className="font-medium">Weather</h3>
            {live.data.weather.length ? live.data.weather.map((w, i) => <p key={i} className="break-words">{w}</p>) : <p className="text-destructive">No forecast returned.</p>}
            <h3 className="font-medium">Headlines</h3>
            {live.data.news.length ? <ul className="list-disc space-y-1 pl-5">{live.data.news.map((n, i) => <li key={i} className="break-words">{n}</li>)}</ul> : <p className="text-destructive">No headlines returned.</p>}
          </div>
        )}
      </section>
    </>
  );
}
