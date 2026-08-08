# goose-chatgpt-web roadmap

This file is the durable handoff for the next implementation steps. Keep it concise and update it when a milestone materially changes.

## Current milestone — finish the first real Goose-owned tool round trip

Status as of 2026-08-08: **PASS.** The first real end-to-end Goose-owned tool round trip succeeded (trace `c57eb8d02ba2`): ordinary Goose → `goose-chatgpt-web` standalone full mode → authenticated ChatGPT Web → `Codex Native` connector/tunnel → real Goose-owned MCP tool (`get_proof_nonce`) → matching `function_call_output` resumed the same active browser response → ChatGPT returned the exact unpredictable nonce → Goose displayed it. Exactly one ChatGPT-Web browser turn was created for the successful attempt.

- `setup --full --standalone` implementation is checkpointed on `agent/standalone-goose-tool-bridge`.
- Standalone full mode, tunnel runtime, MCP broker and authenticated ChatGPT Web text path have been proven live.
- Getting to the clean pass required two fixes beyond the original implementation: enabling `autoApproveToolCalls` in the daemon config (otherwise the browser worker waits for a human to click ChatGPT's "Allow ChatGPT to use Codex Native?" dialog and auto-denies on timeout), and disabling Goose's own session-title auxiliary request (see note below).
- Earlier attempts also surfaced real ChatGPT-side `Too many requests` / 429 throttling and a transient send-stage timeout under concurrent browser turns; both were local/product conditions, not bridge defects — upstream already detects the rate-limit dialog and surfaces a retryable 429.
- Goose auxiliary model calls can multiply ChatGPT-Web traffic. Goose 1.45.0 session naming generated a second concurrent ChatGPT browser turn during proof testing. The ChatGPT-Web path should initially run with `GOOSE_DISABLE_SESSION_NAMING=true`. No separate per-tool-call LLM summary request was found in Goose 1.45.0.
- During an earlier cleanup, forcibly killing Playwright/Chrome exposed a stale-browser-handle failure (`Target page, context or browser has been closed`); a clean daemon/service restart (not `pkill -9`) discards the stale handle and lets the browser worker reacquire a fresh one. See the stale-browser-recovery follow-up below.

Next actions:

1. Local final review (tests, typecheck, diff scope, free-worker review) and any strictly necessary in-scope fixes.
2. Commit and push the completed milestone.
3. Open/update a draft PR against `main`. Do not merge without explicit approval.

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
