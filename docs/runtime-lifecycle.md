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

## Reviewed integrated startup/readiness contract

The earlier candidate order `tunnel → BrowserHost → daemon` is rejected for launcher ownership because the Goose Native broker socket is created by the daemon. Publishing a live tunnel before the daemon leaves a tool-call window with no broker.

Initial launcher-owned order:

```text
Electron/BrowserHost exists
  → qualified BrowserHost startup proof
    → Responses daemon ready / broker exists
      → Secure MCP Tunnel ready (full mode)
        → aggregate ChatGPT-Web application READY
```

The full disposable-surface/helper smoke is a **startup proof**, not a continuous health operation.

Ongoing provider readiness must include a bounded, non-destructive BrowserHost-ready predicate. Daemon process `/healthz` alone is insufficient. The provider must become degraded/unready if BrowserHost is dead/stale/unusable even while the daemon process is alive.

The target health relationship is therefore:

```text
application READY =
  BrowserHost bounded-ready
  ∧ Responses daemon healthy/accepting
  ∧ tunnel ready when full mode requires it
```

## Phase-1 recovery posture

Do **not** enable automatic daemon restart in the initial integrated slice.

Daemon-owned retry circuit, execution-lineage and session state are in memory while BrowserHost tabs can survive the daemon. Restarting the daemon underneath a surviving tab can make a same-execution retry capable of reusing already-submitted browser state. Until that exact-once boundary is explicitly redesigned/proved, daemon failure must mark the application degraded and require the application restart boundary.

Likewise, do not restart the tunnel underneath active HTTP/browser/tool turns. Non-idempotent Goose Native calls may have landed side effects even if the tunnel/MCP response is lost.

Initial integrated recovery should therefore be deliberately conservative:

- no automatic daemon child restart;
- no automatic tunnel restart while any provider/browser/tool work is active;
- fail/degrade closed;
- application restart is the normal recovery boundary.

Later idle-only child recovery may be considered only after deterministic ownership/idempotency tests.

## Quit contract

### External ownership

Application quit must release/persist BrowserHost state as appropriate and exit **without touching externally owned daemon/tunnel processes**.

### Launcher ownership

Quit must be terminating:

1. stop accepting new work;
2. make a bounded drain attempt;
3. terminate only positively launcher-owned child process trees within a hard deadline;
4. persist/destroy BrowserHost and remove stale descriptor state;
5. exit.

Do not revert `quitting=false` and remain alive indefinitely because an ordinary turn exceeded a drain timeout. Signal handling must remain cleanup-capable rather than allowing a second signal to orphan detached children.

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
2. shared BrowserHost startup proof + continuous bounded BrowserHost health predicate;
3. launcher-owned daemon starts before tunnel and aggregate READY is correct;
4. ordinary read-only ChatGPT-Web turn;
5. Goose Native/tool-capable turn with exactly-one submission and exactly-one broker invocation;
6. continuation/multi-turn with no stale execution reuse;
7. quit during idle and active-turn conditions leaves no orphan child/descriptor and terminates within the contract;
8. reopen reaches READY;
9. packaged single-authority autostart/reboot proof;
10. only then normal-path cutover;
11. retain external path briefly as rollback;
12. delete old lifecycle/launchd machinery only after replacement proof.

## Non-regression rules

- Never qualify stop/restart from a turn carried by the exact runtime being manipulated.
- Preserve CGW-009 exact-once submission, semantic reconciliation, typed error classification, progress/liveness, claim responsiveness, terminal retirement, execution identity and tool continuation.
- Never infer ownership from process absence, port state, alias state or stale ownership metadata alone.
- Never restart non-idempotent tool transport underneath active work.
- Timeouts remain safety nets, not normal lifecycle control flow.
- Do not delete the rollback path until the integrated path passes the explicit gates above.
