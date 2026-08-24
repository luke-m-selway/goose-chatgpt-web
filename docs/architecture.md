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
           │ unchanged Responses HTTP/SSE provider boundary
           ▼
┌────────────────────────────────────────────┐
│       ChatGPT-Web Application              │
│           Electron today                   │
│                                            │
│ BrowserHost                                │
│ Responses daemon                           │
│  - lifecycle-pure /healthz                 │
│  - turns_enabled admission gate            │
│ Secure MCP tunnel / MCP child              │
│ helper/worker children                     │
│ supervisor-owned aggregate READY           │
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

Integrated startup fails closed if another owner is live. It never adopts the rollback stack opportunistically.

## Three distinct runtime concepts

Do not collapse these into one signal.

### 1. Lifecycle/process health

Daemon `/healthz` and `proxyHealth` remain process/runtime identity evidence. They must not depend on BrowserHost state because they are used for ownership detection, stale-owner identity and stop-path liveness.

### 2. Provider turn admission

The daemon has a distinct supervisor-owned gate:

```text
turns_enabled = false | true
```

- default false at daemon birth;
- controlled through authenticated `/admin/enable|disable`;
- `/v1/responses` and `/v1/responses/compact` require `!draining && turns_enabled`;
- `/v1/models` remains available while turn admission is disabled;
- existing `accepting_turns` remains drain/resume state and is not overloaded.

### 3. Application READY

Electron/`RuntimeSupervisor` owns aggregate READY. It is not a daemon health field.

READY requires the current launcher startup/recovery epoch to have:

```text
daemon identity healthy
∧ shared qualified BrowserHost proof completed
∧ tunnel ready if full mode
∧ turns_enabled
```

Every actual browser turn still validates BrowserHost at point of use, so a daemon→Electron health poll is unnecessary and would create wrong-way coupling.

## Reviewed launcher-owned dependency order

The integrated path deliberately binds the daemon before the potentially slow BrowserHost proof, but does not admit model turns yet:

```text
ownership gate
  → daemon starts with turns_enabled=false
    → broker socket exists
      → shared qualified BrowserHost startup proof
        → Secure MCP Tunnel ready (full mode)
          → /admin/enable
            → aggregate READY
```

This both removes the old tunnel-before-broker window and leaves `/v1/models`/diagnostics available during browser startup without admitting premature `/v1/responses` work.

The current qualified BrowserHost disposable-surface/helper proof should be moved into a shared module and reused by both ownership modes.

## Provider protocol and reverse tool path

ChatGPT-Web remains primarily a Goose **model provider**. Preserve the existing Responses-compatible HTTP/SSE boundary through Phase 1.

MCP/Goose Native remains the reverse tool path. Its infrastructure becomes application-owned only in `runtimeOwner=launcher`; Goose still owns actual tool authority and approvals.

## Recovery model — initial integrated phase

Do not treat broad child auto-restart as part of first integrated qualification.

Daemon restart while BrowserHost state survives can erase daemon-local retry/execution/session state. If daemon recovery is later enabled, it must restart with `turns_enabled=false`, rerun the BrowserHost proof, restore required tunnel readiness and only then re-enable turns.

Tunnel restart during an active non-idempotent tool invocation can lose the response after a side effect has landed. If tunnel recovery is later enabled it must disable admission, drain/idle, restart the owned tunnel, wait ready, then re-enable.

Initial launcher behavior may simply degrade/fail closed and use the application as the normal restart boundary.

## Shutdown boundary

Quit semantics differ by source.

- **External ownership:** Electron quit must not touch daemon/tunnel.
- **Launcher UI Quit, idle:** clean owned shutdown.
- **Launcher UI Quit, active:** refuse cleanly, keep work alive, offer explicit Cancel-and-Quit through the existing cancellation path.
- **OS logout/reboot/SIGTERM:** disable new turns, bounded drain, cancel outstanding browser work on expiry, graceful shutdown, hard-deadline termination of positively owned children, BrowserHost/descriptor cleanup, exit.

This avoids both unsafe routine force-kill and the current orphan risk when the OS ultimately kills Electron after a refused shutdown.

## Parallel migration / rollback

The integrated application is developed alongside `0b89d5e`, not by tearing it down.

```text
external path       retained baseline / rollback
launcher path       explicit opt-in integrated development mode
```

Ownership transfer and rollback are explicit operator actions. Mixed ownership is an error, not a recovery opportunity.

Old standalone lifecycle/launchd machinery remains installed/available until launcher mode passes startup/admission/readiness, ordinary turn, tool turn, continuation, quit/reopen and packaged autostart/reboot qualification.

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
- task-bound browser-surface cleanup;
- cancel-before-retire semantics across transport-terminal shutdown where possible.

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
