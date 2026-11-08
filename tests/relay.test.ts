import { afterEach, expect, test } from "bun:test";
import { checkStaffRelay } from "../src/lib/whatsapp/relay.server";

const originalFetch = globalThis.fetch;
const originalUrl = process.env['EGREED_RELAY_URL'];
const originalSecret = process.env['EGREED_RELAY_SECRET'];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env['EGREED_RELAY_URL']; else process.env['EGREED_RELAY_URL'] = originalUrl;
  if (originalSecret === undefined) delete process.env['EGREED_RELAY_SECRET']; else process.env['EGREED_RELAY_SECRET'] = originalSecret;
});

test("configured relay returns live staff results with authentication", async () => {
  process.env['EGREED_RELAY_URL'] = 'https://hotel.example/relay';
  process.env['EGREED_RELAY_SECRET'] = 'test-only-secret';
  let capturedUrl = '', capturedBody = '', capturedSecret = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input); capturedBody = String(init?.body);
    capturedSecret = new Headers(init?.headers).get('X-Relay-Secret') ?? '';
    return Response.json({ handled: true, reply: 'Rooms available: 4' });
  }) as typeof fetch;
  expect(await checkStaffRelay('250700000000', 'rooms')).toEqual({ handled: true, reply: 'Rooms available: 4' });
  expect(capturedUrl).toBe('https://hotel.example/relay');
  expect(JSON.parse(capturedBody)).toEqual({ phone: '250700000000', text: 'rooms' });
  expect(capturedSecret).toBe('test-only-secret');
});

test("Lovable failures use Vercel as backup", async () => {
  delete process.env['EGREED_RELAY_URL']; process.env['EGREED_RELAY_SECRET'] = 'test-only-secret';
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return urls.length === 1 ? new Response(null, { status: 503 }) : Response.json({ handled: true, reply: 'Tasks: 2' });
  }) as typeof fetch;
  expect((await checkStaffRelay('250700000000', 'tasks')).reply).toBe('Tasks: 2');
  expect(urls).toEqual(['https://egreed-hostel-os.lovable.app/api/public/whatsapp/relay', 'https://egreed-hostel-os.vercel.app/api/public/whatsapp/relay']);
});

test("unconfigured hotel authentication makes no network calls", async () => {
  delete process.env['EGREED_RELAY_SECRET']; let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  expect(await checkStaffRelay('250700000000', 'rooms')).toEqual({ handled: false });
  expect(calls).toBe(0);
});