import { expect, test } from "bun:test";
import { needsLookup } from "../src/lib/ai/web-search.server.ts";

test("greetings never trigger an online lookup", () => {
  for (const g of ["hi", "muraho", "amakuru?", "thanks!"]) expect(needsLookup(g)).toBe(false);
});

test("factual questions trigger an online lookup", () => {
  expect(needsLookup("who is the president of Rwanda?")).toBe(true);
});
