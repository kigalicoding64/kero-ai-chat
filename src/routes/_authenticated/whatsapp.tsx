import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  listWhatsappMessages,
  listWhatsappNumbers,
  listWhatsappThreads,
  removeWhatsappNumber,
  requestWhatsappVerification,
  setWhatsappAutoReply,
  whatsappStatus,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "Kero on WhatsApp — Egreed Technology" },
      {
        name: "description",
        content:
          "Link your WhatsApp number so Kero answers your messages automatically, day and night.",
      },
      { property: "og:title", content: "Kero on WhatsApp — Egreed Technology" },
      {
        property: "og:description",
        content: "Verify your WhatsApp number and let Kero reply while you sleep.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);

  const status = useServerFn(whatsappStatus);
  const listNumbers = useServerFn(listWhatsappNumbers);
  const listThreads = useServerFn(listWhatsappThreads);
  const listMessages = useServerFn(listWhatsappMessages);
  const requestCode = useServerFn(requestWhatsappVerification);
  const toggleAuto = useServerFn(setWhatsappAutoReply);
  const removeNumber = useServerFn(removeWhatsappNumber);

  const statusQuery = useQuery({ queryKey: ["wa-status"], queryFn: () => status() });
  const numbers = useQuery({
    queryKey: ["wa-numbers"],
    queryFn: () => listNumbers(),
    refetchInterval: 10000,
  });
  const threads = useQuery({
    queryKey: ["wa-threads"],
    queryFn: () => listThreads(),
    refetchInterval: 15000,
  });
  const messages = useQuery({
    queryKey: ["wa-messages", openThread],
    queryFn: () => listMessages({ data: { conversationId: openThread! } }),
    enabled: Boolean(openThread),
    refetchInterval: 10000,
  });

  const add = useMutation({
    mutationFn: () => requestCode({ data: { phone } }),
    onSuccess: () => {
      setPhone("");
      void queryClient.invalidateQueries({ queryKey: ["wa-numbers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; autoReply: boolean }) => toggleAuto({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-numbers"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const drop = useMutation({
    mutationFn: (id: string) => removeNumber({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-numbers"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const businessNumber = statusQuery.data?.businessNumber;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/chat">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <KeroMark className="size-9" />
        <div>
          <h1 className="font-display text-xl font-semibold">Kero on WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Link your number and Kero answers your WhatsApp messages, even while you sleep.
          </p>
        </div>
      </div>

      {statusQuery.data && !statusQuery.data.configured && (
        <p className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          WhatsApp is not connected yet for this app.
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-base font-semibold">Add a number</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your WhatsApp number with the country code, for example +250788123456.
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+250788123456"
            inputMode="tel"
          />
          <Button onClick={() => add.mutate()} disabled={phone.trim().length < 8 || add.isPending}>
            <Phone className="size-4" /> Get code
          </Button>
        </div>
      </section>

      <section className="mt-6 space-y-3">
        {(numbers.data ?? []).map((number) => (
          <div key={number.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">+{number.phone_e164}</p>
                <p className="text-sm text-muted-foreground">
                  {number.verified ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Check className="size-3.5" /> Verified
                    </span>
                  ) : (
                    "Waiting for verification"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {number.verified && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Auto-reply
                    <Switch
                      checked={number.auto_reply}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ id: number.id, autoReply: checked })
                      }
                    />
                  </label>
                )}
                <Button variant="ghost" size="icon" onClick={() => drop.mutate(number.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {!number.verified && number.verification_code && (
              <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm">
                <p>
                  From WhatsApp on <strong>+{number.phone_e164}</strong>, send this code to{" "}
                  <strong>{businessNumber ?? "the Kero WhatsApp number"}</strong>:
                </p>
                <p className="mt-2 font-display text-2xl tracking-[0.3em]">
                  {number.verification_code}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  The code expires in 30 minutes. This page updates itself once Kero receives it.
                </p>
              </div>
            )}
          </div>
        ))}
        {numbers.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No numbers linked yet.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-base font-semibold">WhatsApp conversations</h2>
        <div className="mt-3 space-y-2">
          {(threads.data ?? []).map((thread) => (
            <div key={thread.id} className="rounded-xl border border-border bg-card">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                onClick={() => setOpenThread(openThread === thread.id ? null : thread.id)}
              >
                <span>{thread.contact_name ?? `+${thread.contact_phone}`}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(thread.last_message_at).toLocaleString()}
                </span>
              </button>
              {openThread === thread.id && (
                <div className="space-y-2 border-t border-border px-4 py-3">
                  {(messages.data ?? []).map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.direction === "inbound"
                          ? "text-sm"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      <span className="font-medium">
                        {message.direction === "inbound" ? "Them: " : "Kero: "}
                      </span>
                      {message.content}
                    </div>
                  ))}
                  {messages.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {threads.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing yet — messages appear here as soon as someone writes to Kero.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
