# Kero AI Chat

Build Kero AI V2 for Egreed Technology with NVIDIA NIM API integration as the primary AI provider.

Key requirements:
1. Backend proxy via Supabase Edge Function to securely call the NVIDIA OpenAI-compatible API (`https://integrate.api.nvidia.com/v1/chat/completions`) using `NVIDIA_API_KEY` and configurable `NVIDIA_MODEL` (fallback discovery/default to a standard model like `meta/llama-3.1-70b-instruct` or `meta/llama-3.3-70b-instruct`). Never expose the API key to the client.
2. Real server-sent streaming (SSE) from NVIDIA through the backend to the frontend with stop generation, token streaming, and retry/regenerate.
3. Protected server-side system prompt identifying Kero as the AI assistant of Egreed Technology with multilingual support (English, Kinyarwanda, French, Swahili).
4. Chat interface with left sidebar (conversations list, search, new chat, settings/admin status), main chat area with markdown & syntax-highlighted code blocks with copy, and input box.
5. Persistent conversation engine stored in the database (conversations, messages, ai_models, audit_logs) with full CRUD on conversations.
6. Admin/Developer connection test panel verifying NVIDIA configuration, reachability, model availability, and a real completion test with clear status indicators.
7. Clean modular architecture for future AI providers, tool registry, and multi-channel adapters (WhatsApp/Web). Handle missing API key gracefully with setup instructions.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3936d5d2-8a0e-40cc-9e0f-2e857774d4d4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
