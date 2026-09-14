import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, Lock, MessagesSquare, Zap } from "lucide-react";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kero AI V2 — Egreed Technology's multilingual AI assistant" },
      {
        name: "description",
        content:
          "Kero is Egreed Technology's AI assistant: streaming answers in English, Kinyarwanda, French and Swahili, with saved conversations.",
      },
      { property: "og:title", content: "Kero AI V2 — Egreed Technology" },
      {
        property: "og:description",
        content: "A multilingual AI assistant with streaming replies and saved conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Zap,
    title: "Answers as they are written",
    text: "Replies stream word by word, and you can stop or regenerate at any moment.",
  },
  {
    icon: Globe2,
    title: "Four languages",
    text: "English, Kinyarwanda, French and Swahili — Kero replies in the language you write in.",
  },
  {
    icon: MessagesSquare,
    title: "Your conversations, saved",
    text: "Every chat is stored to your account, searchable and easy to pick up again.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Only you can read your conversations, and credentials never leave the server.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <KeroMark className="size-9" />
          <span className="font-display text-sm font-semibold">Kero AI · Egreed Technology</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24">
        <section className="pt-14 md:pt-24">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-primary">Kero AI V2</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.1] md:text-6xl">
            The assistant Egreed Technology built to work in your language.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            Ask questions, draft documents, debug code, or plan work — Kero answers in English,
            Kinyarwanda, French or Swahili and keeps every conversation for you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start chatting</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/chat">Open Kero</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-border bg-card p-6">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{feature.text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Egreed Technology. Kero is an AI assistant and can make mistakes.
        </div>
      </footer>
    </div>
  );
}
