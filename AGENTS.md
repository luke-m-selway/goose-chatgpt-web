# Agent safety and runtime rules

These instructions apply to coding/automation agents working in this repository.

For explicit code-maintainability review, or before creating or modifying source code, scripts, or behavioral/executable configuration, read and apply `.agents/skills/code-maintainability/SKILL.md`.

For documentation work, and before completing a technical change that may alter documented state, read and apply `.agents/skills/lean-documentation/SKILL.md`.

## Read current documentation first

Before architecture, lifecycle, BrowserHost, tunnel, naming, or cross-project boundary work, read:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/runtime-lifecycle.md`
4. `docs/naming.md`
5. `docs/roadmap.md`
6. `docs/goose-control-plan.md` only when historical/cross-project Goose Control context is relevant

Current documentation outranks historical roadmap material and draft PR designs. Draft PR #25 and PR #26 are design inputs only after the documentation reconciliation on current `main`.

## Check upstream before new diagnosis

Before diagnosing a new ChatGPT-Web UI, browser, authentication, lifecycle, or compatibility problem from scratch, check current upstream `miuuyy/codex-chatgpt-web` first, including recent commits, issues, and pull requests: https://github.com/miuuyy/codex-chatgpt-web

Reuse or adapt an upstream fix when it fits. Do not blindly replace Goose-specific architecture or unrelated live state; investigate locally only where upstream does not already explain the symptom or where this fork intentionally differs.

## Host/session safety

- Preserve ignored `.env` files, browser authentication state, runtime keys, credentials, and unrelated local proof artifacts unless the task explicitly authorizes changing them.
- Never print, log, commit, or otherwise expose credentials or authentication material.
- Do not enumerate macOS Keychain contents or use broad discovery commands such as `security dump-keychain`.
- If a task genuinely requires a Keychain item, access only the exact known service/account entry needed for that task.
- A Goose main agent must never restart, quit, upgrade, relaunch, terminate, or otherwise replace the Goose host carrying its own session.
- Do not use broad process-kill commands for Chrome, Electron, Playwright, the Responses daemon, or the tunnel. Target only a known project-owned process when an explicit test requires it.

## Current ownership and lifecycle

- Goose owns logical session state, tools/approvals, delegation/subagents, recipes/extensions, project execution, and context lifecycle.
- The Responses daemon and Secure MCP Tunnel are independently supervised.
- Electron owns BrowserHost only: authenticated browser state, task-bound surfaces, BrowserHost control, and CDP.
- Do not restore daemon/tunnel ownership to Electron `RuntimeSupervisor` in standalone Goose mode.

Canonical lifecycle:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

Use the canonical lifecycle entry point rather than reconstructing startup from lower-level service scripts.

## Naming and legacy identifiers

- Use the conceptual terminology in `docs/naming.md` for new documentation, prompts, reviews, and architecture descriptions.
- Do not create new `codex*` project/runtime names unless referring to the actual Codex agent/specialist or an explicitly labelled legacy identifier.
- Existing `CODEX_CHATGPT_WEB_*`, `io.github.codex-chatgpt-web.*`, `codex_tool_call`-style public actions, `scripts/start-goose-launcher.ts`, package/bin names, and runtime directories are migration debt, not permission to extend that naming pattern.
- Do not rename persisted/service/public-ABI identifiers piecemeal. Their migration is a separate compatibility milestone with an inventory, old→new mapping, rollback/upgrade plan, and live proof.
- A cosmetic rename must never create duplicate supervisors/runtime homes, strand browser authentication state, or silently invalidate the cached `Goose Native` connector schema.

## Proof boundaries that must not be rediscovered

- BrowserHost readiness uses the descriptor-provided browser helper with Node/Electron Node semantics and `ELECTRON_RUN_AS_NODE=1`. Bun-direct Playwright/CDP is not authoritative readiness evidence.
- A lifecycle/autostart proof launched from an active BrowserHost-backed turn can interfere with the runtime carrying that same turn. Do not generalize such self-interference into an Electron regression.
- Ordinary Goose continuation proof is a persisted named session followed by a separate later `--resume`. Do not substitute stdin-interactive Goose or a hand-written `previous_response_id` request for that proof.
- Fresh ChatGPT Temporary Chats across Goose user turns are expected. Goose, not browser chat reuse, owns durable continuation.
- Ordered macOS autostart is implemented and live-checked short of an actual reboot/login. Reboot/login reconstruction remains **NOT RUN** until explicitly performed.

## Goose Control boundary

- Goose Control is a provider-agnostic Planner-to-Goose control capability and active ownership/planning belongs in Day Shift, not in the ChatGPT-Web BrowserHost transport.
- Historical Goose Control material in this repository may be consulted for ACP/security lessons, but it must not be treated as authority over the current Day Shift plan.
- Goose Control must not address Electron windows, CDP targets, ChatGPT browser sessions, or BrowserHost process identity.
- It is separate from Goose Native's per-turn `turn_token` capability.
- Do not invent a second Goose session/execution API; use native Goose session/ACP mechanisms.

## Delegation

- Until BrowserHost concurrency is explicitly live-qualified for the intended pattern, avoid parallel ChatGPT-Web child fan-out by default.
- A dedicated concurrency qualification may deliberately test parent + ChatGPT-Web children with disposable bounded work.
- When delegating to a non-ChatGPT/free worker, name the intended provider/model explicitly so it does not inherit ChatGPT-Web transport by accident.
