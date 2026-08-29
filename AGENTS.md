# Agent safety and runtime rules

These instructions apply to coding/automation agents working in this repository.

For documentation creation, changes, review, or cleanup, read and apply `.agents/skills/lean-documentation/SKILL.md`.

## Read current documentation first

Before architecture, lifecycle, BrowserHost, tunnel, or ChatGPT-Web reliability work, read:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/runtime-lifecycle.md`
4. `docs/roadmap.md`
5. `docs/cgw-foundation-implementation-plan-2026-08-21.md`

PR #31 is the chronological incident/evidence ledger. PR #35 and the implementation-plan document above are the current planning authority.

## Host/session safety

- Preserve ignored `.env` files, browser authentication state, runtime keys, credentials, and unrelated local proof artifacts unless the task explicitly authorizes changing them.
- Preserve the local untracked scripts `scripts/open-manual-browser.ts` and `scripts/proof-mcp-server.ts` unless the user explicitly authorizes changing them.
- Never print, log, commit, or otherwise expose credentials or authentication material.
- Do not enumerate macOS Keychain contents or use broad discovery commands such as `security dump-keychain`.
- If a task genuinely requires a Keychain item, access only the exact known service/account entry needed for that task.
- A Goose main agent must never restart, quit, upgrade, relaunch, terminate, or otherwise replace the Goose host carrying its own session.
- Do not use broad process-kill commands for Chrome, Electron, Playwright, the Responses daemon, or the tunnel. Target only a known project-owned process when an explicit test requires it.
- One ChatGPT-Web agent at a time unless concurrency is explicitly being qualified.

## Current runtime vs planned runtime

### Current/proven implementation

The currently deployed `0b89d5e` path still uses external/standalone ownership:

- Goose owns logical session state, tools/approvals, delegation/subagents, project execution, and context lifecycle.
- Responses daemon and Secure MCP Tunnel are independently supervised through the existing standalone lifecycle/launchd path.
- Electron owns BrowserHost.
- Existing startup remains `tunnel → BrowserHost proof → daemon` until an integrated replacement is implemented and qualified.

Do not mutate that current path merely because the planned architecture changes its ownership model.

### Approved planning direction — not implemented yet

The earlier permanent prohibition on Electron supervising daemon/tunnel is superseded **as an architecture constraint**. The target is one self-contained ChatGPT-Web application with one top-level owner while Goose remains the durable agent/session/tool/context authority.

Implementation must be parallel and rollback-capable. Keep the current external path available while integrated launcher ownership is developed and qualified.

The reviewed Phase-1 design requires explicit persisted ownership:

```text
runtimeOwner = external | launcher
```

Rules:

- `external`: Electron `RuntimeSupervisor` is observation-only. It must not start, stop, adopt, recover, drain, or otherwise mutate daemon/tunnel ownership, including on application quit.
- `launcher`: the ChatGPT-Web application may own its internal daemon/tunnel children, but only after explicit operator-controlled ownership transfer from the external stack.
- Never infer ownership from an environment flag, process absence, port availability, tunnel alias, or stale launcher state alone.
- Never silently take over the rollback stack.

## Health, admission and READY are different contracts

Do not put BrowserHost state into daemon `/healthz` or `proxyHealth`.

- `/healthz` remains process/runtime identity evidence used by ownership and lifecycle code.
- `accepting_turns` remains the existing drain/resume signal only.
- a distinct supervisor-owned `turns_enabled` gate controls whether `/v1/responses` and `/v1/responses/compact` admit new work.
- `/v1/models` stays available while `turns_enabled=false`.
- Electron/`RuntimeSupervisor` owns aggregate application READY.
- every actual browser turn still performs point-of-use BrowserHost descriptor/process validation.

Required launcher startup sequence:

```text
ownership gate
→ daemon starts with turns_enabled=false
→ broker socket exists / daemon identity proven
→ shared qualified BrowserHost startup proof
→ Secure MCP Tunnel ready (full mode)
→ /admin/enable
→ aggregate application READY
```

Do not enable turns before the BrowserHost proof and required tunnel readiness pass.

## Recovery and quit rules for Phase 1

- Do not enable broad automatic daemon restart in initial launcher qualification. If daemon recovery is later enabled it must restart with `turns_enabled=false`, rerun the BrowserHost proof and required tunnel readiness, then enable.
- Do not restart the tunnel underneath active HTTP/browser/tool turns. Any later tunnel recovery must disable admission, drain to idle, restart, wait ready, then enable.
- Initial integrated failure handling should degrade/fail closed and may use the application as the normal restart boundary.
- In `external` ownership mode, application quit must leave the external daemon/tunnel stack untouched.
- In `launcher` ownership mode, ordinary UI Quit with active work should refuse cleanly and offer explicit Cancel-and-Quit through the existing cancellation path.
- OS logout/reboot/SIGTERM must not refuse indefinitely: disable → bounded drain → cancel-browser-turns on expiry → graceful shutdown → hard-deadline cleanup of positively owned children → BrowserHost/descriptor cleanup → exit.
- Repeated termination signals must remain cleanup-capable so detached children are not orphaned.

## BrowserHost readiness proof boundary

The qualified startup proof remains:

1. authenticated/session-ready BrowserHost;
2. one disposable leased surface;
3. descriptor-provided helper using Node/Electron-Node semantics with `ELECTRON_RUN_AS_NODE=1`;
4. exact leased-surface verification;
5. release in `finally`;
6. post-release BrowserHost re-probe.

Share/reuse this proof across external and launcher-owned startup rather than cloning it. Bun-direct Playwright/CDP is not authoritative readiness evidence.

Do not turn that full proof into a health poll. The daemon must not poll Electron for lifecycle health.

## Autostart migration boundary

Autostart remains frozen during initial integrated manual qualification. Do not allow Electron login-item reconciliation to become a second startup authority while the existing coordinator is installed.

The eventual reboot proof must use a packaged build and exactly one login-visible authority. Cutover/rollback of that authority is an explicit operator action.

## Reliability contracts that must not regress

- CGW-009 exact-once send/submission;
- Gate 2A semantic Markdown reconciliation;
- Gate 2B exact thread-error classification;
- CGW-017 semantic progress vs liveness/interrupted terminal;
- CGW-007 claim responsiveness;
- residual transport-terminal execution retirement;
- execution identity and retry-circuit ownership;
- turn-scoped Goose Native capability/tool continuation;
- task-bound browser-surface cleanup;
- cancel-before-retire ordering across transport-terminal shutdown where possible.

A lifecycle/autostart proof launched from an active BrowserHost-backed turn can interfere with the runtime carrying that same turn. Perform lifecycle/cutover qualification from an external/operator-safe boundary.

## Phase 2 browser-control boundary

Do not combine browser-control replacement with Phase 1 lifecycle ownership.

Observation/reconciliation is already substantially Electron-native through `session.webRequest`/BrowserHost evidence. Preserve that and finish native observation where useful before attempting a broad control rewrite.

Keep the current CDP/Playwright control path until an individual control primitive can be replaced with its existing exact-once and waiting semantics preserved atomically. Treat `webContents.debugger` cautiously: it still uses DevTools protocol machinery and is not evidence that the observed CDP failure class has been removed. Prefer genuinely native candidates such as `sendInputEvent`, narrow `executeJavaScript`, native navigation/load events, and `session.webRequest` where appropriate.

Do not replace mature Playwright auto-waiting with brittle custom polling.

## Goose Control boundary

Goose Control belongs in `luke-m-selway/day-shift` and must remain provider-agnostic. Do not move ChatGPT-Web BrowserHost/tunnel/retry/lifecycle logic into Goose Control.
