import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const analyzeFailedCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ command: z.string().trim().min(1).max(200), phone: z.string().trim().regex(/^\+?\d{9,15}$/), note: z.string().max(500).default("") }).parse(d))
  .handler(async ({ data }) => {
    const { probeRelays, analyzeFailure } = await import("./staff-help.server");
    const probes = await probeRelays(data.phone.replace(/^\+/, ""), data.command);
    try { return { probes, advice: await analyzeFailure(data.command, data.note, probes), error: null as string | null }; }
    catch (e) { console.error("[staff-help]", e); return { probes, advice: "", error: "The AI analysis could not run right now. The connection results above are still accurate." }; }
  });

export const runLiveChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ place: z.string().trim().min(2).max(80), topic: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { liveSamples } = await import("./ai/web-search.server");
    return { ...(await liveSamples(data.place, data.topic)), fetchedAt: new Date().toISOString() };
  });
