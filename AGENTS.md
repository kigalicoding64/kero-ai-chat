<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep official customer support tone and illustrative exchanges in a shared server-only AI guidance module used by the web and WhatsApp prompts, so channels stay consistent without exposing hidden instructions.
- Resolve the global AI provider on the server for web chat, WhatsApp, diagnostics, and health checks; normalize provider streams to the existing chat SSE format to preserve the UI.
- Store administrator-entered provider keys as AES-GCM ciphertext in a service-role-only settings table using a dedicated environment encryption secret; validate admin roles and a real completion before saving or activating, and never return stored keys.
