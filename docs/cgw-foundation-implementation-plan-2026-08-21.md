# CGW integrated-runtime implementation plan — reviewed pre-implementation authority

## Purpose and authority

This document and PR #35 are the current **implementation-order / architecture-planning authority** for `goose-chatgpt-web` after local Ox scouting and fresh Opus adversarial review.

PR #31 remains the chronological incident/evidence ledger. PR #32 / CGW-010 remains a separate large-context workstream.

This documentation branch is intentionally separate from the materially advanced local `fix/electron-native-liveness` lineage. Do **not** push, overwrite, merge, rebase, reset or otherwise reconcile that implementation branch merely to update planning documentation.

## Current local implementation state

Activated diagnostic checkpoint:

`0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6`

Qualified behavioral baseline:

`6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8`

Local Ox scouting verified exact HEAD `0b89d5e`, tracked tree clean, with only the protected untracked files:

- `scripts/open-manual-browser.ts`
- `scripts/proof-mcp-server.ts`

`0b89d5e` is diagnostic-only and has zero behavioral authority.

## Completed reliability foundation — preserve through redesign

Keep these gates closed:

- **CGW-009 — CLOSED / live-proved:** exact-once submission on the real ChatGPT conversation POST path.
- **Gate 2A — CLOSED / qualified:** semantic Markdown reconciliation; fail closed on committed-output mutation/removal.
- **Gate 2B — CLOSED / qualified:** exact thread-error classification.
- **CGW-017 — CLOSED / live-qualified:** semantic progress separated from adapter liveness; bounded interrupted/static-running terminal.
- **CGW-013 — CLOSED:** ordinary verification is browser/runtime-hermetic.
- **CGW-007 / Incident A — CLOSED / qualified:** bounded claim-only typed timeout retry and telemetry.
- **Residual transport-terminal execution retirement — CLOSED / qualified at `6d4bea1`.**

These are semantic invariants to preserve, not a requirement to retain every current mechanism.

CGW-006's historical ~600-second absolute streaming Responses-body deadline is already repaired upstream in Goose 1.46.0. Do not reimplement the old local CGW-006 plan without a specific unresolved dependency.

## Reboot evidence

The full macOS reboot/login proof was run on 2026-08-24.

- automatic ChatGPT-Web infrastructure reconstruction: **FAIL / NOT QUALIFIED**;
- manual canonical post-reboot bring-up: **PASS**;
- exact active runtime remained `0b89d5e`;
- independent raw DevTools baseline before the first post-reboot turn was healthy;
- first post-reboot manual ChatGPT-Web High startup/control was materially healthier and completed substantial Goose Native work, then surfaced a secondary `chatgpt_retry_circuit_open` after an unresolved causal failure.

Do not claim reboot fixed ChatGPT-Web.

## Architectural decision

Primary goal:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

Secondary goal:

```text
minimise idle resources where that stays simple
```

Goose remains a separate application and remains authoritative for durable sessions/history, context/compaction, tools/approvals, delegation and project execution.

ChatGPT-Web remains primarily a Goose **model provider**. Preserve the existing Responses-compatible HTTP/SSE Goose-facing contract in Phase 1.

MCP/Goose Native remains the reverse tool path; its transport can become an internal child of the ChatGPT-Web application without changing Goose's tool authority.

## Scouting conclusion — reuse, do not rebuild

Local source scouting established that the Electron `RuntimeSupervisor` already provides most of the needed lifecycle machinery:

- daemon/tunnel process start;
- readiness waits;
- drain/resume compensation;
- bounded restart machinery;
- process-tree shutdown;
- persisted launcher ownership state;
- external/stale-runtime interlocks.

Standalone Goose currently constructs this supervisor but bypasses its ownership path through bootstrap-only mode, then recreates top-level orchestration in `src/lifecycle.ts` plus launchd-backed `service.ts`, `tunnel-service.ts`, and `autostart.ts`.

Therefore the reviewed verdict is **PARTIAL REUSE**: adapt the existing supervisor and delete duplicate external ownership machinery only after replacement proof. Do not build a second supervisor.

Current upstream `miuuyy/codex-chatgpt-web` v3.0.2 independently supports this direction: launcher-owned supervision behind a Responses-compatible provider boundary. Use upstream as design/reference evidence, not as a blind rebase target.

## Fresh Opus review — verdict and accepted corrections

Fresh Opus verdict: **REVISE**, not reject.

The core reuse architecture is accepted, but the initial candidate had four load-bearing defects:

1. external ownership could still be mutated on application quit/tunnel adoption;
2. provider readiness would decay to daemon-process health after startup;
3. tunnel-before-daemon publishes a connector before its broker exists;
4. automatic daemon/tunnel recovery is unsafe around surviving browser state and non-idempotent tool calls.

The design below incorporates those corrections.

# Reviewed target architecture

```text
Goose
  │ unchanged Responses HTTP/SSE provider contract
  ▼
ChatGPT-Web Application (Electron today)
  │
  ├─ BrowserHost / authenticated ChatGPT partition
  ├─ Responses daemon
  │    ├─ provider execution/replay state
  │    ├─ Goose Native turn broker
  │    └─ browser helper client
  ├─ Secure MCP tunnel / MCP child (full mode)
  ├─ aggregate health/readiness
  └─ one startup/shutdown/restart boundary
```

Internal process separation remains allowed. The replaceability boundary is the whole ChatGPT-Web provider application, not each internal process.

# Ownership contract

Ownership must become a **persisted config fact**, not an env inference:

```text
runtimeOwner = external | launcher
```

Validate it in the shared config path and Electron `RuntimeSupervisor` config validation.

## `runtimeOwner=external`

This is the existing standalone/rollback path.

The Electron supervisor must be non-mutating across **all** relevant entry points:

- `startIfConfigured` / startup;
- stop/restart/setup shutdown;
- application quit;
- stale-owned-runtime cleanup;
- configured-tunnel adoption for stop;
- recovery paths.

It may observe/report state, but must perform zero daemon/tunnel control operations.

A matching port, config, alias/profile, missing launcher state, dead external daemon or healthy external tunnel does **not** transfer ownership.

Opening and closing the integrated-capable Electron app while external mode is active must leave the rollback stack byte-for-byte operational.

## `runtimeOwner=launcher`

Launcher mutation is permitted only after explicit operator-controlled transfer from external mode with the external stack verified stopped.

The launcher owns only children positively attributable to this ownership mode. Initial launcher mode should avoid opportunistic tunnel adoption entirely; start from a clean ownership boundary.

Mixed ownership is an invalid state and must fail closed rather than be reconciled automatically.

# Readiness contract

The initial candidate incorrectly placed BrowserHost readiness only in startup ordering. That would allow readiness to decay to daemon process liveness.

Two distinct BrowserHost predicates are required:

## Startup proof

Reuse/share the existing qualified proof from `src/lifecycle.ts`:

1. authenticated/session-ready BrowserHost;
2. disposable leased surface;
3. descriptor-provided helper using `ELECTRON_RUN_AS_NODE=1`;
4. exact leased-surface verification;
5. release in `finally`;
6. post-release BrowserHost re-probe.

Move this into one shared module rather than cloning it.

## Continuous health predicate

Do **not** run the full leased-surface proof repeatedly.

Add a bounded, non-destructive BrowserHost-ready probe to provider/application health. The daemon `/healthz`/supervisor health path must no longer equate daemon process health with provider readiness.

Target aggregate state:

```text
READY = browser_host_ready
     ∧ daemon_healthy_and_accepting
     ∧ tunnel_ready_if_full_mode
```

BrowserHost death/stale descriptor/unusable control state must make the provider degraded/unready even if the daemon PID and HTTP listener survive.

# Dependency order

The current standalone order remains unchanged until cutover.

For **launcher-owned** startup, reverse the daemon/tunnel dependency because the Goose Native broker socket is created by the daemon.

Target launcher order:

```text
BrowserHost exists
  → shared qualified BrowserHost startup proof
    → Responses daemon ready / broker socket exists
      → Secure MCP Tunnel ready
        → aggregate READY
```

This removes the window in which ChatGPT can reach a live connector before the broker exists.

# Recovery contract — deliberately minimal Phase 1

The pre-existing `RuntimeSupervisor` contains bounded child restart machinery, but **do not enable it as normal Phase-1 behavior**.

## Daemon

Automatic daemon restart is unsafe while BrowserHost tabs survive because daemon-local retry/execution/session state disappears while the browser can reuse the same trace/tab. This can weaken the exact-once submission boundary on a same-execution retry.

Initial launcher behavior on daemon failure:

- mark application degraded/unready;
- stop accepting normal provider work;
- require application restart from an external/operator-safe boundary.

No automatic daemon child restart until the surviving-tab/execution-state contract is redesigned and deterministically proven.

## Tunnel

Never restart the tunnel underneath active HTTP/browser/tool work. A non-idempotent Goose Native command may have performed a side effect before the MCP/tunnel response is lost.

Initial launcher behavior:

- no automatic tunnel restart under load;
- preferably no automatic tunnel restart at all in the first live slice;
- later idle-only recovery may be considered after explicit idempotency/ownership proof.

The application itself is the Phase-1 restart boundary.

# Quit/shutdown contract

## External ownership

Electron quit must not call mutating supervisor shutdown against external daemon/tunnel ownership. Persist/release BrowserHost state as appropriate and exit while leaving the standalone stack untouched.

## Launcher ownership

Quit must terminate rather than cancel indefinitely:

1. stop accepting new work;
2. make a bounded graceful drain attempt;
3. after the deadline, terminate only positively owned daemon/tunnel process trees;
4. persist/destroy BrowserHost and remove stale descriptor state;
5. exit within a stated hard deadline.

Do not restore `quitting=false` and remain alive because an ordinary Goose turn exceeded a drain timeout. Signal handling must remain cleanup-capable on repeated termination signals so detached children are not orphaned.

# Autostart contract

Freeze autostart during the initial manual integrated phase.

Dropping bootstrap-only mode currently risks reactivating Electron login-item auto-reconciliation while the existing `io.github.codex-chatgpt-web.autostart` coordinator is still installed. Avoid introducing launchd-detection complexity; simply do not have two authorities.

Initial launcher mode:

- no Electron login-item enable/reconcile;
- existing coordinator remains the current external-path authority;
- manual launcher qualification only.

After manual integrated qualification:

- use a **packaged build** for autostart/reboot proof;
- explicitly disable the old coordinator before enabling the new authority;
- verify exactly one login-visible startup authority;
- prove reboot/login → aggregate READY;
- preserve explicit rollback.

Electron-native login-item autostart is the preferred eventual simplification because it matches one-application ownership and current upstream, but it is not yet qualified.

# Parallel migration and rollback

Do not tear down `0b89d5e` first.

```text
external provider path     current baseline / rollback
launcher provider path     explicit opt-in integrated development path
```

## Cutover into launcher mode

```text
external lifecycle stop
  → verify daemon/tunnel stopped
  → set/use runtimeOwner=launcher
  → start app
  → prove aggregate READY
```

## Rollback

```text
clean launcher quit
  → verify owned children/descriptor gone
  → restore runtimeOwner=external
  → external lifecycle start
```

Integrated start must refuse if ownership preconditions are ambiguous.

# Precise current → target ownership diff

| Area | Current `0b89d5e` | Reviewed Phase-1 target |
|---|---|---|
| Ownership source | bootstrap-only env + standalone conventions | persisted `runtimeOwner` config |
| Electron supervisor | constructed but bypassed for standalone lifecycle | reused in launcher mode; inert in external mode |
| Daemon owner | launchd `KeepAlive` | launcher child only in launcher mode |
| Tunnel owner | launchd `KeepAlive` | launcher child only in launcher mode |
| BrowserHost owner | Electron | Electron unchanged |
| Startup orchestration | `src/lifecycle.ts` external coordinator | Electron application in launcher mode |
| Launcher child order | dormant supervisor tunnel→daemon | BrowserHost proof → daemon → tunnel |
| BrowserHost startup proof | lifecycle-only | shared by both ownership modes |
| Ongoing provider health | daemon-centric | includes bounded BrowserHost readiness + daemon + tunnel |
| Daemon auto recovery | launchd / dormant supervisor restart | disabled in initial launcher phase |
| Tunnel auto recovery | launchd / dormant monitor/restart | disabled initially or at minimum prohibited under active work |
| Quit | external lifecycle / bootstrap-only BrowserHost release | ownership-aware; external non-mutating, launcher terminating owned children |
| Autostart | coordinator + managed launchd definitions | frozen initially; eventual single Electron login authority after packaged proof |
| Goose-facing provider API | Responses HTTP/SSE | unchanged |
| Browser automation | helper + Playwright/CDP | unchanged in Phase 1 |
| Reliability invariants | current qualified mechanisms | preserved without semantic weakening |

# Smallest implementation sequence when authorized

## Slice 1 — ownership and readiness foundation

Behavior-neutral for the existing external path.

1. Add `runtimeOwner` to config/schema and Electron config validation.
2. Guard every mutating supervisor path so `external` performs zero daemon/tunnel mutations, including quit/shutdown.
3. Extract/share the qualified BrowserHost startup proof.
4. Add continuous bounded BrowserHost readiness to daemon/application health and require it in supervisor/provider-ready decisions.
5. Change launcher-owned dependency to daemon-before-tunnel.
6. Freeze Electron autostart reconciliation in the development launcher mode.
7. Disable automatic daemon/tunnel recovery for the initial launcher path.

Do not yet delete any external lifecycle code.

## Slice 2 — launcher-owned start and terminating quit

1. Add explicit launcher-mode startup using the existing supervisor.
2. Require aggregate READY.
3. Implement ownership-aware terminating quit with bounded drain and hard cleanup deadline.
4. Ensure no orphan Responses port, tunnel child or stale BrowserHost descriptor remains after launcher exit.
5. Add deterministic external-mode zero-mutation tests around start **and quit**.

## Slice 3 — bounded manual qualification

From an operator-safe boundary, one ChatGPT-Web agent at a time:

1. **External zero-mutation proof:** external stack live → open integrated-capable app → app refuses launcher ownership → quit → external daemon/tunnel still loaded/healthy.
2. Explicit external stop → launcher start → aggregate READY.
3. Ordinary read-only ChatGPT-Web turn.
4. Goose Native/tool-capable turn; prove exactly one submission and exactly one broker invocation.
5. Continuation/multi-turn; prove fresh human-turn execution identity and no stale same-execution resubmission.
6. Quit during idle.
7. Quit during an active turn; prove bounded termination, no orphan children, no stale descriptor.
8. Reopen and reach READY.
9. Roll back to external path and prove it still starts/works.

Do not retry an unclassified failure merely to obtain a pass.

## Slice 4 — packaged autostart/reboot cutover

Only after Slice 3 passes:

1. packaged build;
2. old coordinator explicitly disabled;
3. Electron login authority enabled as the sole startup authority;
4. verify exactly one login-visible authority;
5. full reboot/login → application → aggregate READY;
6. ordinary turn after reboot;
7. rollback procedure proven.

Only then make launcher ownership the normal path.

## Slice 5 — deletion/simplification

After launcher path is normal and rollback confidence window passes:

- remove obsolete standalone launchd daemon/tunnel supervision;
- remove external lifecycle orchestration that no longer serves rollback/support;
- remove bootstrap-only ownership branches made obsolete by the new config contract;
- simplify docs/tests/config;
- do **not** retain duplicate watchdog/recovery systems for historical symmetry.

# Qualification gates / deterministic tests

## Ownership

- `runtimeOwner=external` invokes zero daemon/tunnel control across start, stop, restart, shutdown, recovery and quit.
- live external stack remains healthy after opening/quitting integrated-capable Electron.
- launcher mode refuses ambiguous/mixed ownership.

## Readiness

- dead/stale BrowserHost causes `browser_host_ready=false` and aggregate provider unready while daemon remains alive.
- full BrowserHost startup proof remains lease/release-safe.
- continuous health does not acquire disposable browser surfaces.

## Ordering

- broker socket/daemon readiness exists before launcher invokes tunnel connect.
- no connector is published before the broker can accept claims.

## Exact-once/tool path

- existing CGW-009 tests stay green unchanged.
- one live tool-capable qualification records exactly one submission acceptance and one broker invocation.
- no automatic daemon/tunnel restart occurs underneath the turn.

## Execution identity / continuation

- new human turn receives fresh provider execution identity.
- exact retry/tool-result lineage retains only permitted identity.
- same-execution ambiguous retry cannot resubmit into a surviving stale tab.

## Quit

- external quit leaves external stack untouched.
- launcher quit during active work exits within the stated deadline.
- no daemon/tunnel orphan and no stale BrowserHost descriptor after exit.
- reopen reaches READY.

## Autostart

- packaged proof only.
- exactly one login-visible authority.
- old coordinator disabled before Electron login autostart becomes authoritative.

# Phase 2 — browser-control dependency reduction

Do not start Phase 2 as part of lifecycle consolidation.

Fresh Opus corrected the proposed decomposition: observation/reconciliation is already substantially Electron-native through `session.webRequest` and BrowserHost network/submission evidence. Therefore “native control + Playwright observation” would be backwards and could split the exact-once handshake across transports.

Reviewed Phase-2 direction:

1. finish/consolidate native observation/reconciliation where it naturally exists;
2. retain one proven Playwright/CDP control path;
3. replace control stages one at a time only when waiting semantics and exact-once authority can move atomically.

For submission specifically, do not move the Enter/control primitive without moving and re-proving the send epoch/native acceptance contract as one semantic unit.

Treat `webContents.debugger` cautiously. It is still DevTools protocol machinery and does not prove removal of the observed CDP/DevTools serving failure family; moving it onto Electron main may also increase main-thread coupling.

Prefer genuinely native candidates where appropriate:

- `webContents.sendInputEvent`;
- native navigation/load events;
- narrow `executeJavaScript`;
- `session.webRequest`.

Do not replace mature Playwright auto-waiting with brittle polling.

# Remaining non-blocking investigation

Before enabling any launcher-owned tunnel **adoption or recovery** later, determine whether `tunnel-client runtimes cleanup/stop` sees a runtime started by `tunnel-client run --profile-dir ... --profile ...`.

This is no longer an implementation blocker for Slice 1 because:

- `external` ownership forbids adoption/mutation;
- initial `launcher` ownership requires a clean explicit cutover and may fresh-start its own tunnel;
- automatic tunnel recovery is not part of the first live slice.

# Governing design principles

- native before custom;
- prevent before recover;
- leanest adequate solve;
- evidence before mechanism;
- retries only at native/idempotent boundaries;
- observability remains observational;
- timeouts are safety nets, not normal control flow;
- deterministic proof first, ecological evidence second;
- explicit ownership beats inference;
- one clear restart boundary beats overlapping recovery systems;
- delete old machinery only after its replacement is proven.

# Stop boundary

The mandatory planning sequence is complete: docs/evidence reconciliation, current/upstream inspection, local Ox scouting, coherent architecture/diff, fresh Opus adversarial review, and reconciliation are done.

**STOP before implementation.**

No integrated-app implementation, destructive reconciliation, normal-path cutover, old-path deletion, merge/rebase/reset or mutation of `fix/electron-native-liveness` is authorized until the user explicitly starts implementation.
