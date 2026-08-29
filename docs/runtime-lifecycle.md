# Runtime lifecycle and macOS autostart

Status: **current/proven** for the existing manually reconstructed runtime; the actual reboot/login autostart proof has been **RUN and FAILED / NOT QUALIFIED**. The integrated single-application lifecycle below is the **reviewed implementation plan** and is not yet implemented or qualified.

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`).
Qualified behavioral baseline beneath it: `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`).

The PR #35 documentation branch does not contain that local implementation lineage and must not be used to overwrite or reconcile `fix/electron-native-liveness`.

## Current/proven ownership

The deployed standalone path still has three separately owned layers:

1. **Secure MCP Tunnel** — independently supervised outbound connector/tool runtime.
2. **Electron BrowserHost** — authenticated browser/surface owner.
3. **Responses daemon** — independently supervised loopback Responses provider and browser-helper owner.

Existing startup remains:

```text
Secure MCP Tunnel ready
  → Electron BrowserHost genuinely ready
    → Responses daemon ready
```

Existing shutdown remains:

```text
Responses daemon
  → Electron BrowserHost
    → Secure MCP Tunnel
```

The existing operator path remains `codex-chatgpt-web lifecycle <status|start|restart|stop>` until the integrated path is qualified.

Goose remains outside this infrastructure ownership tree and owns durable logical session/history, tools/approvals, delegation, project execution and context/compaction lifecycle. Browser chats remain disposable transport/cache state.

## Existing BrowserHost readiness contract

Usable BrowserHost readiness remains stronger than PID/descriptor/CDP existence. The current qualified proof:

1. waits for authenticated/session-ready BrowserHost;
2. leases one disposable surface;
3. runs the descriptor-provided helper with Node/Electron-Node semantics and `ELECTRON_RUN_AS_NODE=1`;
4. verifies the exact leased surface;
5. releases the lease in `finally`;
6. re-probes BrowserHost after release.

This proof must be shared/reused by the integrated path rather than duplicated or weakened.

## Actual reboot/login proof — RUN, FAIL / NOT QUALIFIED

A full macOS reboot/login was performed on 2026-08-24.

Observed result:

- automatic ChatGPT-Web infrastructure reconstruction did **not** occur;
- manual canonical bring-up was required and succeeded;
- exact active checkpoint remained `0b89d5e`;
- independent raw DevTools baseline before the first post-reboot turn was healthy (`/json/version` ~17.3 ms total, raw WS connect ~46.2 ms, `Browser.getVersion` ~4.86 ms, total raw CDP check ~51.1 ms);
- the first post-reboot manual ChatGPT-Web High run had materially healthier startup/control behavior and completed substantial Goose Native work, then surfaced `chatgpt_retry_circuit_open` after an unresolved causal failure.

Correct verdict: **automatic reconstruction RUN — FAIL / NOT QUALIFIED; manual reconstruction PASS**. Do not claim reboot fixed ChatGPT-Web.

## Reviewed integrated ownership model

The target is one ChatGPT-Web application/top-level owner while preserving internal process separation where useful.

Ownership must be an explicit persisted configuration fact, not an environment inference:

```text
runtimeOwner = external | launcher
```

### `external`

The current standalone/rollback path owns daemon/tunnel lifecycle. Electron `RuntimeSupervisor` is observation-only and must perform **zero mutating runtime operations** on start, stop, restart, shutdown, recovery, stale-state cleanup or application quit.

A live external stack must never be adopted or stopped merely because it uses the configured port/tunnel alias or because launcher ownership state is absent.

### `launcher`

The ChatGPT-Web application owns only children it started/positively owns. Entry into this mode requires an explicit operator-controlled ownership transfer after the external stack is stopped.

No silent takeover is allowed.

## Lifecycle health vs provider admission

Do **not** put BrowserHost readiness into daemon `/healthz` or `proxyHealth`.

`proxyHealth` is lifecycle/ownership identity evidence used for external-owner detection, stale-owner identity and stop-path liveness. Making that health depend on BrowserHost would cause a browser failure to make a live daemon look absent/external ownership look reclaimable, and could trigger recovery of the wrong component.

Therefore:

- `/healthz` remains process/runtime identity health;
- `accepting_turns` keeps its existing `!draining` meaning;
- BrowserHost state is not polled by the daemon;
- Electron/`RuntimeSupervisor` owns aggregate application READY;
- actual browser turns retain point-of-use BrowserHost descriptor/process validation.

Add a distinct supervisor-owned daemon admission gate:

```text
turns_enabled = false | true
```

with authenticated `POST /admin/enable` and `POST /admin/disable` on the existing lifecycle control-token path.

Required semantics:

- daemon starts with `turns_enabled=false`;
- `/v1/responses` and `/v1/responses/compact` require `!draining && turns_enabled`;
- disabled turn admission returns a legible 503;
- `/v1/models` remains available while turns are disabled;
- drain/resume compensation remains independent through existing `accepting_turns` semantics.

## Reviewed launcher-owned startup/readiness contract

The launcher-owned sequence is:

```text
0. external-owner / runtimeOwner gate passes

1. Responses daemon starts with turns_enabled=false
   → waitForProxy(requireAccepting=false)
   → loopback identity is proven
   → Goose Native broker socket exists

2. shared qualified BrowserHost startup proof passes

3. Secure MCP Tunnel starts (full mode only)
   → broker already exists before connector publication

4. POST /admin/enable
   → turns_enabled=true

5. supervisor writes/publishes aggregate READY
```

This is preferable to waiting to bind the daemon until after BrowserHost proof: diagnostics/catalog remain available during cold startup and failed-start cleanup is provably idle because no provider turn could have been admitted.

Aggregate READY belongs to Electron/`RuntimeSupervisor`, not `/healthz`, and means the current launcher start/recovery epoch has daemon identity, completed BrowserHost proof, required tunnel readiness, and enabled turn admission.

The full disposable-surface/helper smoke is a startup/recovery proof, not a continuous polling operation.

## Phase-1 recovery posture

Do **not** enable broad automatic daemon/tunnel restart as part of initial live qualification.

Daemon-owned retry circuit, execution-lineage and session state are in memory while BrowserHost state can survive. A daemon restart therefore cannot simply flip back to READY.

If daemon recovery is later enabled it must re-enter at daemon birth with `turns_enabled=false`, rerun the BrowserHost proof and required tunnel readiness, and only then re-enable turns.

Likewise, a tunnel must never be restarted underneath active HTTP/browser/tool work. A non-idempotent Goose Native call may have landed a side effect even if its MCP/tunnel response is lost.

If tunnel recovery is later enabled, required sequence is:

```text
disable new turns
→ bounded drain / idle proof
→ restart positively owned tunnel
→ wait tunnel ready
→ enable turns
```

Initial launcher qualification may keep both child auto-recovery paths disabled and use the application as the normal restart boundary.

## Quit contract

Quit semantics are asymmetric.

### External ownership

Application quit must release/persist BrowserHost state as appropriate and exit **without touching externally owned daemon/tunnel processes**.

### Launcher ownership — UI Quit

If no active work exists, perform normal clean launcher shutdown.

If active HTTP/browser/tool work exists, refuse UI Quit cleanly, leave the runtime alive, identify the active work, and offer explicit **Cancel-and-Quit** through the existing cancellation/admin path. Do not force-terminate ordinary active work merely because the user clicked Quit.

### Launcher ownership — OS logout/reboot/SIGTERM

OS/process termination must ultimately terminate and clean up owned children:

```text
disable new turns
→ bounded drain
→ on expiry: cancel-browser-turns
→ graceful daemon shutdown
→ hard-deadline terminate positively owned daemon/tunnel process trees
→ persist/destroy BrowserHost + descriptor cleanup
→ exit
```

The cancel-before-shutdown step preserves the existing transport-terminal safety argument as far as possible before a forced boundary. A non-idempotent side effect that already landed cannot be un-landed; do not add durable provider conversation state to pretend otherwise.

Repeated termination signals must remain cleanup-capable so detached children are not orphaned.

## Parallel migration / rollback

Keep the existing `0b89d5e` provider path available while launcher ownership is developed.

```text
external path             retained baseline / rollback
launcher-owned path       explicit opt-in development mode
```

Ownership transfer is bounded and explicit:

```text
external → launcher:
  old lifecycle stop
  → verify external daemon/tunnel stopped
  → set/launch launcher-owned mode
  → reach aggregate READY

launcher → external rollback:
  quit launcher-owned app cleanly
  → verify owned children gone
  → restore external ownership/config
  → old lifecycle start
```

Integrated startup must fail closed if the expected ownership preconditions are not satisfied.

## Autostart migration

Autostart is **frozen during initial integrated manual qualification**.

Do not allow Electron login-item reconciliation to become a second authority while the existing macOS coordinator remains installed/enabled. Dev-mode proofs cannot validate this because packaged Electron owns the real login-item behavior.

Only after manual integrated startup, read-only turn, tool turn, continuation and quit/reopen pass should autostart be migrated.

The eventual reboot proof must:

- use a packaged build;
- enable exactly one login-visible authority;
- verify the other authority is disabled before reboot;
- prove application reconstruction and aggregate READY;
- preserve a documented rollback operation.

Electron-native login-item autostart is the preferred eventual simplification because it matches the one-application ownership model and current upstream, but it is **not yet qualified**.

## Integrated qualification order

1. ownership guards prove `external` mode is completely non-mutating;
2. daemon starts launcher-owned with `turns_enabled=false` while `/v1/models` remains available and Responses turns return legible 503;
3. shared qualified BrowserHost proof passes;
4. tunnel starts only after broker exists;
5. turn admission is enabled and aggregate READY is published;
6. ordinary read-only ChatGPT-Web turn;
7. Goose Native/tool-capable turn with exactly-one submission and exactly-one broker invocation;
8. continuation/multi-turn with no stale execution reuse;
9. UI Quit during active work refuses safely; explicit Cancel-and-Quit uses the existing cancellation path;
10. OS-style termination during active work records cancellation before forced exit and leaves no orphan child/descriptor;
11. reopen reaches READY;
12. packaged single-authority autostart/reboot proof;
13. only then normal-path cutover;
14. retain external path briefly as rollback;
15. delete old lifecycle/launchd machinery only after replacement proof.

## Non-regression rules

- Never qualify stop/restart from a turn carried by the exact runtime being manipulated.
- Preserve CGW-009 exact-once submission, semantic reconciliation, typed error classification, progress/liveness, claim responsiveness, terminal retirement, execution identity and tool continuation.
- Never infer ownership from process absence, port state, alias state or stale ownership metadata alone.
- Keep `/healthz` lifecycle-pure; do not make child ownership decisions from BrowserHost availability.
- Never restart non-idempotent tool transport underneath active work.
- Never re-enable turns after daemon/tunnel recovery without satisfying the required readiness sequence.
- Timeouts remain safety nets, not normal lifecycle control flow.
- Do not delete the rollback path until the integrated path passes the explicit gates above.
