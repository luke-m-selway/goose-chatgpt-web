# goose-chatgpt-web roadmap

This file contains **current and next provider/runtime work only**. The older chronological engineering diary remains in Git history at `dd44b74` and is historical, not a source of current lifecycle or priority instructions.

## Current runtime checkpoint — qualified

Status: **current/proven**, with one named validation gap.

- Electron BrowserHost ownership is BrowserHost-only.
- Responses daemon and Secure MCP Tunnel are independently supervised.
- Canonical lifecycle is proven: `tunnel ready → BrowserHost genuinely ready → daemon ready`, with reverse shutdown.
- BrowserHost readiness is proven through the descriptor-provided Node/Electron Node browser-helper path; Bun-direct Playwright/CDP is not authoritative.
- Ordinary Goose first turn and separate persisted-session `--resume` continuation are proven.
- Ordered macOS autostart is implemented with one login-visible coordinator that invokes canonical `lifecycle start`; daemon/tunnel launchd definitions live under the runtime home and remain launchd-supervised.
- The earlier failed in-task lifecycle/autostart proof was self-interference from the active BrowserHost-backed turn, not a general Electron regression.

Remaining validation: **actual Mac reboot/login reconstruction is NOT RUN.** This remains an explicit lifecycle validation item but is not a blocker for bounded provider-level qualification work.

## Next provider qualification — ChatGPT-Web child concurrency

Status: **planning/testing; not yet qualified.**

The Electron implementation is structurally multi-turn: BrowserHost and helper layers support multiple independently identified browser turns, with a hard implementation ceiling of five simultaneous ChatGPT browser surfaces. That ceiling is a safety bound, not a qualified operating recommendation.

The practical qualification target is deliberately smaller:

- normal target: one ChatGPT-Web parent + up to two ChatGPT-Web children;
- rare optional target: parent + three children;
- do not optimize for five simultaneous children without a demonstrated use case.

Current evidence does **not** yet prove ChatGPT-Web parent → ChatGPT-Web child under the final Electron runtime. The first disposable attempt was blocked by ChatGPT/OpenAI tool-call safety before any child launched, so it is not evidence of an Electron concurrency failure.

Qualification should separate:

1. Goose-native delegate/recipe invocation behavior;
2. connector/tool-call safety acceptance;
3. Electron simultaneous-turn isolation;
4. Goose Native turn/tool-authority isolation;
5. account-level 429/rate behavior.

Prefer the normal Goose-native recipe/worker/subagent path if that matches the previously proven delegation pattern. Make no transport code changes until a live proof identifies a transport defect.

If one child passes, prove genuine parent/child overlap. If that is clean, test two children concurrently. Only then consider a third child. Document only the exact concurrency envelope that passes live.

## Separate remaining runtime validation

At an appropriate operator-controlled boundary, perform the actual macOS reboot/login reconstruction proof:

```text
reboot/login
  → ordered autostart reconstructs runtime
  → canonical lifecycle healthy
  → ordinary Goose first turn
  → separate dependent --resume
```

Do not perform this from a Goose turn that depends on the runtime being restarted.

## Deferred maintenance — mechanical naming migration

Current conceptual terminology is already Goose-first, but inherited implementation/persisted/public identifiers remain. [`naming.md`](naming.md) is the durable compatibility plan for migrating them later as a dedicated milestone.

Known families include:

- `CODEX_CHATGPT_WEB_*`;
- `io.github.codex-chatgpt-web.*`;
- `codex_tool_call` and related connector-visible actions;
- `scripts/start-goose-launcher.ts`;
- package/bin/application identifiers;
- runtime/application-support directories and other persisted state.

Do not mix these renames into subagent/concurrency work or other reliability fixes. The later migration must inventory all consumers, preserve installed/autostart/browser-auth state, handle connector schema caching deliberately, and prove upgrade compatibility.

## Cross-project boundary — Goose Control

Goose Control is provider-agnostic Planner-to-Goose control infrastructure. Active ownership/planning belongs in the separate Day Shift project, not in this provider/browser repository.

This repository may retain historical Goose Control material for ACP/security context, but no Electron/CDP/BrowserHost behavior should be designed around it. `goose-chatgpt-web` should provide a reliable ChatGPT-Web provider; Day Shift decides when and how to use that provider alongside Codex ACP, Claude ACP, and free workers.
