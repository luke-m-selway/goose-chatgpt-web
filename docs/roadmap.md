# goose-chatgpt-web roadmap

This file is the durable handoff for the next implementation steps. Keep it concise and update it when a milestone materially changes.

## Current milestone — finish the first real Goose-owned tool round trip

Status as of 2026-08-08:

- `setup --full --standalone` implementation is checkpointed on `agent/standalone-goose-tool-bridge`.
- Standalone full mode, tunnel runtime, MCP broker and authenticated ChatGPT Web text path have been proven live.
- The tool path has been proven in pieces: ChatGPT can request the connector/tool; the bridge emits a Responses `function_call`; Goose executes the real proof MCP tool; a matching `function_call_output` can resume the same active browser turn and produce the real nonce.
- The final uninterrupted end-to-end proof is still pending because a burst of repeated test attempts triggered ChatGPT's `Too many requests` / 429 protection.
- Upstream already detects that rate-limit dialog and surfaces a retryable 429. Do not hammer retries; use a real quiet cooldown and then exactly one fresh proof attempt.
- During cleanup, forcibly killing Playwright/Chrome exposed a stale-browser-handle failure. The daemon has since been cleanly restarted and is healthy; tunnel and broker remain healthy; no automatic retry loop is active; no ChatGPT request was sent during recovery.

Next actions:

1. Preserve a genuine zero-request cooldown period.
2. Perform exactly one integrated ordinary-Goose proof attempt with no preliminary ChatGPT smoke/probe request.
3. On success, stop all further live proof traffic.
4. Run local tests/review, commit/push any final fixes, and open a draft PR.
5. Do not merge without explicit approval.

## Next milestone — browser UX and reliability

After the tool-bridge milestone is closed:

- Prefer headless browser operation for normal automated ChatGPT turns so Chrome does not steal focus or move user input into a newly opened browser window.
- Keep interactive login, account setup and connector configuration headed/visible.
- If headless proves incompatible with ChatGPT Web, fall back in this order:
  1. headed without activation/focus theft;
  2. headed and immediately hidden/minimized.
- Add recovery for a crashed or externally killed managed browser so a stale Playwright browser/context handle is discarded and a fresh browser is acquired instead of returning `Target page, context or browser has been closed`.
- Keep rate-limit handling conservative: a 429 should trigger backoff/stop behaviour with a very low retry cap, never a rapid retry loop.

## Then — reconcile with upstream before more custom development

Before adding more architecture, inspect the current `miuuyy/codex-chatgpt-web` delta from this fork's base and reuse upstream fixes where possible.

Pay particular attention to newer upstream work around:

- rate-limit handling;
- connector migration/versioning (`Codex Native` / newer connector contracts);
- model/runtime changes;
- browser/runtime reliability;
- any changes that would supersede custom work in this fork.

Do not independently rebuild functionality that upstream already provides cleanly.

## Then — continue the core Goose architecture

Only after upstream reconciliation:

- choose and verify the strongest tool-capable ChatGPT-Web tier suitable as the normal Goose model;
- investigate persistent ChatGPT browser conversation reuse across separate user turns, while Goose remains the canonical durable conversation history;
- broaden Goose-owned tool coverage only after the single-tool lifecycle is solid;
- then revisit Day Shift orchestration, free-worker delegation, provider routing and related refinements.

## Boundaries

- `goose-chatgpt-web` owns ChatGPT Web transport and Goose provider compatibility.
- Day Shift remains a separate orchestration/policy project.
- Reuse Goose-native and upstream mechanisms before creating new orchestration layers.
- Never commit credentials, browser auth state, `.env`, runtime keys or other secrets.
- Keep implementation work on feature branches and draft PRs; no merge without explicit approval.
