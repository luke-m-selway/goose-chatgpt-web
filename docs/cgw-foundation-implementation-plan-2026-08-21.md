# CGW integrated-runtime implementation plan — reviewed pre-implementation authority

## Purpose and authority

This document and PR #35 are the current **implementation-order / architecture-planning authority** for `goose-chatgpt-web` after local Ox scouting, fresh Opus adversarial review, and one narrow Opus clarification pass on readiness/startup/quit semantics.

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

Local source scouting established that the Electron `RuntimeSupervisor` already provides most needed lifecycle machinery: daemon/tunnel start, readiness waits, drain/resume compensation, bounded restart machinery, process-tree shutdown, persisted launcher ownership state, and external/stale-runtime interlocks.

Standalone Goose currently constructs this supervisor but bypasses its ownership path through bootstrap-only mode, then recreates top-level orchestration in `src/lifecycle.ts` plus launchd-backed `service.ts`, `tunnel-service.ts`, and `autostart.ts`.

Therefore the reviewed verdict is **PARTIAL REUSE**: adapt the existing supervisor and delete duplicate external ownership machinery only after replacement proof. Do not build a second supervisor.

Current upstream `miuuyy/codex-chatgpt-web` v3.0.2 independently supports this direction: launcher-owned supervision behind a Responses-compatible provider boundary. Use upstream as design/reference evidence, not as a blind rebase target.

## Opus review + clarification — accepted corrections

Fresh Opus verdict: **REVISE**, not reject. The follow-up clarification then corrected one of Opus's own initial recommendations.

Accepted conclusions:

1. external ownership must remain non-mutating on **all** launcher paths, including quit and tunnel adoption;
2. daemon `/healthz` must **not** depend on BrowserHost state, because `proxyHealth` is lifecycle/ownership identity evidence and folding BrowserHost into it would corrupt external-owner detection and stale-owner recovery;
3. provider turn admission needs a distinct supervisor-owned `turns_enabled` gate rather than overloading `accepting_turns`;
4. launcher-owned startup should bind the daemon/broker first with turns disabled, then prove BrowserHost, then start tunnel, then enable turns;
5. automatic daemon/tunnel recovery is unsafe unless it re-enters those admission/readiness rules and is turn-aware; initial live Phase 1 remains deliberately conservative;
6. UI Quit and OS/process termination need different semantics so ordinary user quit can refuse active work while forced OS termination still cleans owned children and preserves cancel-before-retire as far as possible.

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
  │    ├─ process/runtime /healthz identity
  │    └─ supervisor-owned turns_enabled admission gate
  ├─ Secure MCP tunnel / MCP child (full mode)
  ├─ supervisor-owned aggregate READY state
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

The Electron supervisor must be non-mutating across all relevant entry points:

- `startIfConfigured` / startup;
- stop/restart/setup shutdown;
- application quit;
- stale-owned-runtime cleanup;
- configured-tunnel adoption for stop;
- recovery paths.

It may observe/report state, but performs zero daemon/tunnel control operations.

A matching port, config, alias/profile, missing launcher state, dead external daemon or healthy external tunnel does **not** transfer ownership.

Opening and closing the integrated-capable Electron app while external mode is active must leave the rollback stack operational.

## `runtimeOwner=launcher`

Launcher mutation is permitted only after explicit operator-controlled transfer from external mode with the external stack verified stopped.

The launcher owns only children positively attributable to this ownership mode. Initial launcher mode avoids opportunistic tunnel adoption entirely; start from a clean ownership boundary.

Mixed ownership is invalid and must fail closed rather than be reconciled automatically.

# Readiness and admission contract

## Keep daemon health lifecycle-pure

Daemon `/healthz` remains process/runtime identity health. It must **not** poll or depend on BrowserHost readiness.

Reason: `proxyHealth` is used for external-owner detection, stale-owner identity and stop-path liveness. If BrowserHost failure made `proxyHealth` false, a live external daemon could stop looking externally owned and launcher recovery could target the wrong component.

Therefore:

- `/healthz` stays lifecycle/identity-oriented;
- `accepting_turns` keeps its existing meaning `!draining` and is not overloaded;
- BrowserHost readiness remains owned by Electron/`RuntimeSupervisor` aggregate state;
- every real browser turn still gets point-of-use descriptor/process validation through the existing BrowserHost client path.

## Distinct provider admission gate

Add:

```text
turns_enabled: boolean
```

with authenticated existing-control-token operations:

```text
POST /admin/enable
POST /admin/disable
```

Contract:

- default `turns_enabled=false` at daemon birth;
- supervisor is the only lifecycle writer;
- `/v1/responses` and `/v1/responses/compact` require `!draining && turns_enabled`;
- when disabled they return a legible 503 rather than accepting a turn;
- `/v1/models` remains available while turns are disabled because its catalog path has no BrowserHost dependency;
- `accepting_turns` remains the drain/resume signal and existing drain compensation semantics stay intact.

## Startup BrowserHost proof

Reuse/share the existing qualified proof from `src/lifecycle.ts`:

1. authenticated/session-ready BrowserHost;
2. disposable leased surface;
3. descriptor-provided helper using `ELECTRON_RUN_AS_NODE=1`;
4. exact leased-surface verification;
5. release in `finally`;
6. post-release BrowserHost re-probe.

Move this into one shared module rather than cloning it.

## Aggregate READY

Electron/`RuntimeSupervisor` is the one owner of application READY.

READY is reached only after:

```text
daemon identity healthy
∧ turns_enabled
∧ qualified BrowserHost proof completed for this launcher start/recovery epoch
∧ tunnel ready if full mode
```

Do not make daemon health poll Electron. Point-of-use browser validation remains authoritative for each actual turn.

# Exact launcher-owned startup sequence

The current standalone order remains unchanged until cutover.

For **launcher-owned** startup:

```text
0. Ownership gate
   runtimeOwner == launcher
   ∧ standalone != true
   ∧ existing proxyHealth/ownership-state external detection passes
   → otherwise fail closed before starting anything.

1. Spawn Responses daemon.
   waitForProxy(requireAccepting=false).
   Port bound; identity confirmed; broker socket exists.
   turns_enabled=false.

2. Run shared qualified BrowserHost startup proof.

3. Start Secure MCP Tunnel in full mode.
   Broker socket already exists before connector publication.

4. POST /admin/enable.
   turns_enabled=true.

5. writeState("ready") and publish aggregate READY.
```

Failure at steps 2–4 runs failed-start cleanup against a daemon that has admitted no provider turn, so drain/cleanup is deterministic.

# Recovery contract — deliberately conservative

The pre-existing `RuntimeSupervisor` contains bounded child restart machinery, but do not enable broad automatic recovery as normal Phase-1 behavior.

## Daemon

A daemon restart can erase daemon-local retry/execution/session state while BrowserHost state survives. Initial live Phase 1 therefore treats daemon failure as application degradation and uses application restart as the normal recovery boundary.

If daemon recovery is later enabled, it must re-enter at startup step 1 with `turns_enabled=false`, re-run the BrowserHost startup proof, and cannot enable turns until the complete readiness sequence passes again.

## Tunnel

Never restart the tunnel underneath active HTTP/browser/tool work. A non-idempotent Goose Native command may have performed a side effect before the MCP/tunnel response is lost.

If tunnel recovery is later enabled, it must:

1. disable new turns;
2. drain existing provider/browser work within the bounded existing drain contract;
3. restart the owned tunnel only after idle proof;
4. re-enable turns only after tunnel readiness.

Initial launcher qualification may keep tunnel auto-recovery disabled entirely.

# Quit/shutdown contract

Quit semantics are deliberately asymmetric.

## External ownership

Electron quit must not call mutating supervisor shutdown against external daemon/tunnel ownership. Persist/release BrowserHost state as appropriate and exit while leaving the standalone stack untouched.

## Launcher ownership — ordinary UI Quit

If no active work exists, perform normal clean launcher shutdown.

If active HTTP/browser/tool work exists:

- refuse UI Quit cleanly;
- keep application/runtime alive;
- identify the active work;
- provide an explicit **Cancel-and-Quit** action using the existing cancel path rather than force-killing by default.

Cancel-and-Quit reuses the existing browser-turn cancellation/admin path and then performs normal owned shutdown.

## Launcher ownership — OS logout/reboot/SIGTERM

OS/process termination must never refuse indefinitely.

Required sequence:

```text
disable new turns
→ bounded drain
→ on expiry: /admin/cancel-browser-turns
→ graceful /admin/shutdown
→ hard-deadline terminateOwnedProcessTree for positively owned children
→ persist/destroy BrowserHost + descriptor cleanup
→ exit
```

The cancel step matters because current transport-terminal safety relies on cancelling browser work before retiring/clearing same-execution state. Forced termination cannot guarantee whether a non-idempotent side effect already landed, so do not invent durable provider turn state; instead preserve cancel-before-retire where possible and make the forced-termination boundary legible in diagnostics.

Signal handling must remain cleanup-capable on repeated termination signals so detached children are not orphaned.

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
| Launcher child order | dormant supervisor tunnel→daemon | daemon disabled → BrowserHost proof → tunnel → enable |
| BrowserHost startup proof | lifecycle-only | shared by both ownership modes |
| Daemon `/healthz` | process/runtime identity | unchanged; remains ownership-safe |
| Turn admission | drain only | distinct `turns_enabled` gate + drain |
| Application READY | fragmented/implicit | supervisor-owned aggregate readiness |
| `/v1/models` | daemon/catalog availability | remains available while turns disabled |
| Daemon auto recovery | launchd / dormant supervisor restart | disabled in initial launcher phase; later recovery must rerun proof before enable |
| Tunnel auto recovery | launchd / dormant monitor/restart | disabled initially; later requires disable→drain→restart→enable |
| UI Quit | current requestQuit semantics | refuse active work + explicit Cancel-and-Quit |
| OS termination | can orphan after failed drain/second signal | disable→drain→cancel→shutdown→hard owned cleanup→exit |
| Autostart | coordinator + managed launchd definitions | frozen initially; eventual single Electron login authority after packaged proof |
| Goose-facing provider API | Responses HTTP/SSE | unchanged |
| Browser automation | helper + Playwright/CDP | unchanged in Phase 1 |
| Reliability invariants | current qualified mechanisms | preserved without semantic weakening |

# Smallest implementation sequence when authorized

## Slice 1 — ownership, admission and shared readiness foundation

Behavior-neutral for the existing external path.

1. Add `runtimeOwner` to config/schema and Electron config validation.
2. Guard every mutating supervisor path so `external` performs zero daemon/tunnel mutations, including quit/shutdown.
3. Add `turns_enabled` plus authenticated `/admin/enable|disable`; default false; gate `/v1/responses` and `/compact`, leave `/v1/models` available.
4. Extract/share the qualified BrowserHost startup proof.
5. Implement launcher startup: daemon disabled → BrowserHost proof → tunnel → enable → READY.
6. Keep `/healthz` lifecycle-pure and keep `accepting_turns` drain-only.
7. Freeze Electron autostart reconciliation in development launcher mode.
8. Keep broad automatic daemon/tunnel recovery disabled for initial launcher qualification.

Do not yet delete external lifecycle code.

## Slice 2 — launcher quit/termination semantics

1. Normal idle launcher quit.
2. UI Quit with active work refuses cleanly and exposes Cancel-and-Quit through the existing cancellation path.
3. OS/process termination uses disable → bounded drain → cancel-browser-turns on expiry → graceful shutdown → hard owned-tree cleanup → exit.
4. Ensure no orphan Responses port, tunnel child or stale BrowserHost descriptor remains after launcher exit.
5. Add deterministic external-mode zero-mutation tests around start and quit.

## Slice 3 — bounded manual qualification

From an operator-safe boundary, one ChatGPT-Web agent at a time:

1. **External zero-mutation proof:** external stack live → open integrated-capable app → quit → external daemon/tunnel still loaded/healthy.
2. Explicit external stop → launcher start.
3. While `turns_enabled=false`, `/v1/models` succeeds and `/v1/responses` returns legible 503.
4. BrowserHost proof completes → tunnel ready → enable → aggregate READY.
5. Ordinary read-only ChatGPT-Web turn.
6. Goose Native/tool-capable turn; prove exactly one submission and exactly one broker invocation.
7. Continuation/multi-turn; prove fresh human-turn execution identity and no stale same-execution resubmission.
8. UI Quit during active work refuses without disrupting the turn; Cancel-and-Quit follows the explicit cancel path.
9. OS-style termination during active work records cancel-browser-turns before exit and leaves no orphan children/descriptor.
10. Reopen and reach READY.
11. Roll back to external path and prove it still starts/works.

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

## Admission/readiness

- daemon starts with `turns_enabled=false`.
- `/v1/responses` and `/compact` return a legible 503 before enable.
- `/v1/models` remains available while turns are disabled.
- `accepting_turns` remains drain-only and existing drain/resume compensation tests stay valid.
- `/healthz` remains independent of BrowserHost state and remains safe for external-owner detection.
- no `POST /admin/enable` occurs before a fresh qualified BrowserHost proof and required tunnel readiness.

## Ordering

- broker socket/daemon identity exists before launcher invokes tunnel connect.
- no provider turn can be admitted before BrowserHost proof and tunnel readiness.

## Recovery

- daemon recovery cannot reach enable without a fresh BrowserHost proof.
- tunnel recovery, if enabled later, cannot restart underneath active work; it must disable/drain first.

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
- UI quit during active work refuses cleanly without child mutation.
- Cancel-and-Quit uses existing cancel-browser-turns before owned shutdown.
- OS termination observes cancel-browser-turns before forced exit when drain expires.
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

This is no longer an implementation blocker for Slice 1 because external ownership forbids adoption/mutation, initial launcher ownership requires a clean explicit cutover and may fresh-start its own tunnel, and automatic tunnel recovery is not part of first live qualification.

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
- separate lifecycle health from provider admission/readiness;
- one clear restart boundary beats overlapping recovery systems;
- delete old machinery only after its replacement is proven.

# Stop boundary

The mandatory planning sequence is complete: docs/evidence reconciliation, current/upstream inspection, local Ox scouting, coherent architecture/diff, fresh Opus adversarial review, clarification, and reconciliation are done.

**STOP before implementation.**

No integrated-app implementation, destructive reconciliation, normal-path cutover, old-path deletion, merge/rebase/reset or mutation of `fix/electron-native-liveness` is authorized until the user explicitly starts implementation.