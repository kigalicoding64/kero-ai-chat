# Kero AI V2 — Egreed Technology

An AI chat assistant powered by NVIDIA NIM, with saved conversations, streaming replies, and an admin connection test panel.

## What gets built

**Chat page (main screen)**
- Left sidebar: list of past conversations, search box, "New chat" button, settings/admin link, and a small badge showing whether the AI connection is healthy.
- Center: message thread with streaming replies, formatted text, code blocks with syntax highlighting and a copy button, stop-generation button, and retry/regenerate on the last answer.
- Bottom: message input with send/stop.

**Conversations**
- Saved in the app database: create, rename, delete, search, reopen. Each conversation has its own page address, so refreshing or sharing a link reopens the same chat.
- Messages are saved as they finish streaming.

**Kero's identity**
- A system prompt kept on the server (never sent to the browser) defines Kero as Egreed Technology's assistant and instructs it to reply in the user's language among English, Kinyarwanda, French and Swahili.

**Admin / connection test panel**
- A settings page that checks, one step at a time with clear pass/fail indicators: API key present, NVIDIA endpoint reachable, chosen model available in the model list, and a real short completion round-trip (with latency).
- If the key is missing, the panel and the chat both show plain setup instructions instead of failing silently.

## Technical notes

- This project runs on TanStack Start, so the secure backend proxy is a TanStack server route (`src/routes/api/chat.ts`) rather than a Supabase Edge Function. Same result: `NVIDIA_API_KEY` stays server-side only.
- Streaming: server route calls `https://integrate.api.nvidia.com/v1/chat/completions` with `stream: true` and pipes SSE deltas to the client; client abort cancels the upstream request.
- `NVIDIA_MODEL` env var, defaulting to `meta/llama-3.3-70b-instruct`; admin panel reads `/v1/models` to verify availability.
- Lovable Cloud (database + auth) for storage. Tables: `conversations`, `messages`, `ai_models`, `audit_logs`, with row-level security scoping every row to its owner, plus grants.
- Sign-in required so each person only sees their own conversations (email + password).
- Modular layout for future growth:
  - `src/lib/ai/providers/` — `nvidia.ts` behind a shared provider interface, so another provider is a new file.
  - `src/lib/ai/tools/` — tool registry (empty registry + types to start).
  - `src/lib/ai/channels/` — channel adapter interface with a `web` adapter; WhatsApp can be added later.
- Admin checks and conversation CRUD run through typed server functions in `src/lib/*.functions.ts`.

## Order of work

1. Enable Lovable Cloud; create tables, policies, grants; add auth pages.
2. Add `NVIDIA_API_KEY` secret, provider module, system prompt, streaming chat route.
3. Build chat UI (sidebar, thread, composer, code blocks, stop/regenerate).
4. Conversation CRUD + persistence wiring.
5. Admin connection test panel.
6. Test end to end: sign up, send a message, stream, stop, regenerate, reload, run admin checks.

## Open item

I will request the `NVIDIA_API_KEY` from you at step 2 — get it from build.nvidia.com (starts with `nvapi-`).
