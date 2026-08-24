# Architecture

Status: **current/proven** for the existing provider path described first; the integrated ChatGPT-Web application below is the **reviewed implementation plan** and is not yet implemented or qualified.

## Current/proven runtime shape

```text
Goose
  │ custom ChatGPT-Web Responses provider
  ▼
Responses daemon (independently supervised, loopback)
  │
  ├─ bounded response/turn replay state
  ├─ capability broker in full mode
  └─ browser helper
          │ BrowserHost control + Playwright/CDP
          ▼
  Electron BrowserHost
          │ authenticated task-bound surface
          ▼
  ChatGPT Temporary Chat

Full-mode tool path:
ChatGPT → Goose Native → Secure MCP Tunnel → active Goose tool contract
       ← same browser response ← tool result ← Goose execution/approval
```

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`), diagnostic-only on qualified behavioral baseline `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`).

## Durable Goose boundary

Goose remains authoritative for logical session/history, context/compaction, tools/approvals, delegation/subagents and project execution. Browser chats remain disposable transport/cache state. The integrated application must not become a durable second agent or conversation authority.

## Current ownership vs target ownership

### Current implementation

- Responses daemon: loopback provider, bounded replay/turn correlation, broker, browser-helper owner.
- Electron: authenticated ChatGPT partition, task-bound surfaces, BrowserHost control/CDP and BrowserHost-local cleanup.
- Secure MCP Tunnel: independently supervised reverse tool transport.

### Reviewed target

The previous requirement that those three components remain independently top-level-owned is superseded as an architectural constraint.

The target is:

```text
┌─────────────────────┐
│        Goose        │
│ durable agent state │
└──────────┬──────────┘
           │ unchanged model-provider boundary
           │ Responses-compatible HTTP/SSE
           ▼
┌────────────────────────────────────────────┐
│       ChatGPT-Web Application              │
│           Electron today                   │
│                                            │
│ BrowserHost                                │
│ Responses daemon                           │
│ Secure MCP tunnel / MCP child              │
│ helper/worker children                     │
│ aggregate health/readiness                 │
│ startup/shutdown                           │
└────────────────────────────────────────────┘
```

Process separation remains allowed. The simplification is one trusted top-level owner/restart boundary.

## Ownership is explicit configuration

Runtime ownership must be a persisted config fact:

```text
runtimeOwner = external | launcher
```

This replaces inference from `CODEX_WEB_GPT_LAUNCHER_BOOTSTRAP_ONLY`, process/port absence, tunnel alias state or launcher-state absence.

- `external`: current standalone/launchd path is authoritative; Electron supervisor is observation-only and cannot mutate daemon/tunnel on start, stop, shutdown, recovery or quit.
- `launcher`: ChatGPT-Web application may mutate only children positively attributable to launcher ownership after explicit operator-controlled transfer.

Integrated startup must fail closed if another owner is live. It must never adopt the rollback stack opportunistically.

## Reviewed launcher-owned dependency order

The earlier candidate `tunnel → BrowserHost → daemon` is rejected for the integrated path. The Goose Native broker socket belongs to the daemon, so a tunnel published first creates a live connector that cannot reach its broker.

Launcher-owned startup should be:

```text
BrowserHost exists
  → qualified BrowserHost startup proof
    → Responses daemon ready / broker socket exists
      → Secure MCP Tunnel ready (full mode)
        → aggregate application READY
```

The current qualified BrowserHost disposable-surface/helper proof should be moved into a shared module and reused by both ownership modes.

## Readiness is an ongoing predicate

The startup proof must not decay into daemon-process-only health.

The full leased-surface/helper smoke is a bounded **startup qualification**, not something to run on every health request. Ongoing health should use a non-destructive bounded BrowserHost readiness probe alongside daemon and tunnel state.

Target:

```text
READY = browser_host_ready
     ∧ daemon_healthy_and_accepting
     ∧ tunnel_ready_if_full_mode
```

If BrowserHost dies or its descriptor becomes stale while daemon remains alive, the provider must report degraded/unready rather than healthy.

## Provider protocol and reverse tool path

ChatGPT-Web remains primarily a Goose **model provider**. Preserve the existing Responses-compatible HTTP/SSE boundary through Phase 1.

MCP/Goose Native remains the reverse tool path. Its infrastructure becomes application-owned only in `runtimeOwner=launcher`; Goose still owns actual tool authority and approvals.

## Recovery model — initial integrated phase

Do not treat child auto-restart as part of the first integrated proof.

Daemon restart while BrowserHost tabs survive can erase daemon-local retry/execution/session state while reusing the same browser trace/tab, creating an exact-once hazard. Tunnel restart during an active non-idempotent tool invocation can lose the response after a side effect has landed.

Initial launcher behavior:

- child failure degrades/fails the application closed;
- no automatic daemon restart;
- no automatic tunnel restart under active work;
- application restart is the normal recovery boundary.

Later idle-only child recovery may be reconsidered after deterministic ownership/idempotency proof.

## Shutdown boundary

In external mode, Electron quit must not touch daemon/tunnel.

In launcher mode, quit must terminate the application boundary: bounded drain attempt, hard-deadline termination of positively owned children, BrowserHost persistence/cleanup, descriptor cleanup, then exit. It must not cancel quit indefinitely and leave detached children orphaned.

## Parallel migration / rollback

The integrated application is developed alongside `0b89d5e`, not by tearing it down.

```text
external path       retained baseline / rollback
launcher path       explicit opt-in integrated development mode
```

Ownership transfer and rollback are explicit operator actions. Mixed ownership is an error, not a recovery opportunity.

Old standalone lifecycle/launchd machinery remains installed/available until launcher mode passes startup/readiness, ordinary turn, tool turn, continuation, terminating quit/reopen and packaged autostart/reboot qualification.

## Autostart

Do not enable a second login authority during initial launcher qualification. Keep Electron login-item auto-reconciliation disabled/frozen while the existing coordinator remains authoritative.

After manual integrated qualification, prefer eventual Electron-owned login autostart because it matches the one-application boundary and current upstream, but prove it only in a packaged build after explicitly disabling the old coordinator. Exactly one login-visible authority is permitted for reboot proof.

## Reliability invariants to transplant

Ownership consolidation must preserve:

- CGW-009 exact-once submission;
- Gate 2A semantic Markdown reconciliation;
- Gate 2B exact thread-error classification;
- CGW-017 progress/liveness handling;
- CGW-007 claim responsiveness;
- residual transport-terminal execution retirement;
- execution identity/retry-circuit semantics;
- turn-scoped Goose Native tool continuation;
- task-bound browser-surface cleanup.

## Phase 2 browser-control direction

Do not combine browser-control replacement with lifecycle consolidation.

The tree already has substantial **native observation** in Electron (`session.webRequest`, BrowserHost network/submission evidence). Therefore the next useful decomposition is not “native control + Playwright observation.”

Preferred Phase-2 direction:

1. finish/consolidate native observation/reconciliation where it is already natural;
2. keep one proven Playwright/CDP control path while observation is stabilized;
3. replace individual control primitives only when their waiting semantics and exact-once proof move atomically with them.

Treat `webContents.debugger` cautiously: it still uses DevTools protocol machinery and runs through Electron main; it does not demonstrate removal of the observed DevTools failure class.

Genuinely native candidates worth investigating are `webContents.sendInputEvent`, native navigation/load events, narrow `executeJavaScript`, and `session.webRequest`. Do not replace Playwright auto-waiting with brittle polling.

Security remains: context isolation on, Node integration off for remote ChatGPT surfaces, no generic privileged IPC, and fail-closed browser/UI drift.

## Resource policy

Primary objective:

```text
one application
one top-level owner
one restart boundary
one readiness contract
```

Idle-resource minimisation/demand-start is secondary and retained only where it stays simple inside that ownership model.
