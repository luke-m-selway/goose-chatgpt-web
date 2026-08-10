# ChatGPT-Web context-window follow-up

Status: **deferred reliability follow-up; do not merge blindly**

## Observation

During Goose testing, ChatGPT-Web main sessions display a **128k** context window, while this repo already defines larger mode-specific limits in `src/chatgpt-web-models.ts`:

- Instant / Medium: **150k**
- High: **185k**
- Extra High: **256k**
- Pro: **272k**

Goose v1.45 falls back to **128k** when it lacks model-specific context metadata. This strongly suggests the Goose-side ChatGPT-Web integration is not currently receiving the bridge-owned per-mode limits.

## Why this matters

Goose auto-compaction is based on the context limit it believes applies. With the default 0.8 threshold, a 128k fallback can trigger compaction earlier than intended. For example, ChatGPT-Web High would compact around ~102k instead of ~148k if Goose knew the intended 185k limit.

This may contribute to premature/frequent compaction, but it is separate from browser-host reliability itself.

## Follow-up during Electron/browser-host work

When implementing the managed-Chrome/CDP → Electron/browser-host migration, inspect the Goose-side model registration/config path and make sure the existing ChatGPT-Web per-mode limits are advertised to Goose.

Prefer a **per-model/provider-native mechanism**. Do **not** solve this with a global `GOOSE_CONTEXT_LIMIT`, because that could leak the ChatGPT-Web limit into delegated Mistral/NVIDIA/Groq workers.

Do not assume a 1M ChatGPT-Web context merely because the underlying API model may support it. Treat this repo's existing 150k/185k/256k/272k mode-specific limits as the contract unless stronger product evidence is established.

## Desired outcome

Goose should see the correct ChatGPT-Web parent limit for the selected mode while delegated children continue to use their own provider/model-specific limits.
