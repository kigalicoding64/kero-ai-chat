import { cn } from "@/lib/utils";

/** Kero's identity mark: a stylised "K" glyph in Egreed's accent. */
export function KeroMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-primary font-display text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2.1">
        <path d="M7 4v16" strokeLinecap="round" />
        <path d="M18 4.5 8.5 12l9.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
