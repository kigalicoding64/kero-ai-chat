import { afterEach, expect, test } from "bun:test";
import { needsLookup, weatherLocation, webContextFor } from "../src/lib/ai/web-search.server.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("greetings never trigger an online lookup", () => {
  for (const g of ["hi", "muraho", "amakuru?", "thanks!"]) expect(needsLookup(g)).toBe(false);
});

test("factual questions trigger an online lookup", () => {
  expect(needsLookup("who is the president of Rwanda?")).toBe(true);
});

test("current Kinyarwanda news questions trigger lookup", () => {
  expect(needsLookup("Amakuru y'u Rwanda uyu munsi")).toBe(true);
});

test("weather location is extracted without assuming a city", () => {
  expect(weatherLocation("weather in Kigali today?")).toBe("Kigali");
  expect(weatherLocation("weather?")).toBe("");
});

test("live weather uses current forecast values", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); urls.push(url);
    return Response.json(url.includes("geocoding")
      ? { results: [{ name: "Kigali", country: "Rwanda", latitude: -1.95, longitude: 30.06 }] }
      : { timezone: "Africa/Kigali", current: { time: "2026-11-08T16:00", temperature_2m: 23.5 }, current_units: { temperature_2m: "°C" } });
  }) as typeof fetch;
  const result = await webContextFor([{ role: "user", content: "weather in Kigali today?" }]);
  expect(urls).toHaveLength(2);
  expect(urls[1]).toContain("current=temperature_2m");
  expect(result).toContain('"temperature_2m":23.5');
});

test("live news retrieves dated headlines rather than dictionary answers", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response('<rss><channel><item><title>Rwanda update</title><link>https://news.google.com/story</link><pubDate>Sun, 08 Nov 2026 14:00:00 GMT</pubDate></item></channel></rss>');
  }) as typeof fetch;
  const result = await webContextFor([{ role: "user", content: "latest Rwanda news" }]);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain("news.google.com/rss/search");
  expect(result).toContain("Sun, 08 Nov 2026 14:00:00 GMT");
  expect(result).toContain("Rwanda update");
});

test("private hotel requests never go to public search", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  await webContextFor([{ role: "user", content: "our hotel rooms available today?" }]);
  expect(calls).toBe(0);
});

test("public lookups have a shared three-second abort deadline", async () => {
  let deadline = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now();
    await new Promise<void>((resolve) => init?.signal?.addEventListener("abort", () => { deadline = Date.now() - started; resolve(); }, { once: true }));
    throw new Error("timed out");
  }) as typeof fetch;
  await webContextFor([{ role: "user", content: "latest Rwanda news" }]);
  expect(deadline).toBeGreaterThanOrEqual(2900);
  expect(deadline).toBeLessThan(3600);
});
