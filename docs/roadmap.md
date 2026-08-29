# goose-chatgpt-web roadmap

This file contains **current and next work only**. Historical engineering evidence remains in Git history and PR #31.

## Current runtime checkpoint

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`).
Qualified behavioral baseline: `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`).

`0b89d5e` is diagnostic-only. Tracked tree was verified clean by the local Ox scout; protected untracked scripts remain `scripts/open-manual-browser.ts` and `scripts/proof-mcp-server.ts`.

Already-qualified guarantees remain closed and must survive redesign:

- CGW-009 exact-once submission — CLOSED / live-proved;
- Gate 2A semantic Markdown reconciliation — CLOSED / qualified;
- Gate 2B exact thread-error classification — CLOSED / qualified;
- CGW-017 progress-vs-liveness — CLOSED / live-qualified;
- CGW-013 verification split — CLOSED;
- CGW-007 retry-claim responsiveness — CLOSED / qualified;
- residual transport-terminal execution retirement — CLOSED / qualified at `6d4bea1`.

CGW-006's historical ~600-second absolute streaming-body deadline is already repaired upstream in Goose 1.46.0. PR #32 / CGW-010 remains separate unless a dependency is unavoidable.

## Reboot/autostart evidence

The full macOS reboot/login proof was run on 2026-08-24.

Result: **automatic reconstruction FAIL / NOT QUALIFIED; manual reconstruction PASS**.

Do not claim reboot fixed ChatGPT-Web.

## Planning gates — complete

The mandatory pre-implementation planning sequence is complete:

1. documentation/evidence reconciliation — complete;
2. current fork/current upstream inspection — complete;
3. bounded local Ox ownership/browser/invariant scout — complete;
4. coherent candidate architecture + current→target ownership diff — complete;
5. fresh Opus adversarial review — complete with verdict **REVISE**;
6. narrow Opus clarification on readiness/startup/quit — complete;
7. findings reconciled into the implementation plan — complete.

The project is now at the **STOP-before-implementation** boundary. No implementation is authorized until the user explicitly starts it.

## Reviewed Phase 1 — ownership consolidation only

Primary goal:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

Preserve the existing Goose-facing Responses HTTP/SSE provider contract and existing browser automation semantics in Phase 1.

Reuse/adapt the existing Electron `RuntimeSupervisor`; do not build another supervisor.

### Phase-1 ownership fact

Add explicit persisted ownership:

```text
runtimeOwner = external | launcher
```

- `external`: existing standalone/launchd stack remains authoritative; Electron supervisor performs zero daemon/tunnel mutations, including on quit.
- `launcher`: application owns only positively attributable children after explicit operator cutover.
- mixed ownership fails closed; no silent adoption of the rollback stack.

### Phase-1 health/admission split

Keep daemon lifecycle health separate from provider admission:

- `/healthz` / `proxyHealth` remain process/runtime identity evidence and do not depend on BrowserHost;
- `accepting_turns` remains drain/resume state;
- add supervisor-owned `turns_enabled`, default false;
- authenticated `/admin/enable|disable` controls turn admission;
- `/v1/responses` and `/compact` require `!draining && turns_enabled`;
- `/v1/models` stays available while turns are disabled;
- Electron/`RuntimeSupervisor` owns aggregate READY.

### Phase-1 startup order

```text
ownership gate
  → daemon starts with turns_enabled=false / broker exists
    → shared qualified BrowserHost startup proof
      → Secure MCP Tunnel ready
        → enable turns
          → aggregate application READY
```

This is the reviewed replacement for both the initial tunnel-first sketch and the later BrowserHost-before-daemon sketch.

### Phase-1 recovery posture

Initial launcher qualification keeps broad automatic child recovery disabled. If later enabled:

- daemon recovery must restart disabled, rerun the BrowserHost proof and required tunnel readiness, then enable;
- tunnel recovery must disable admission, drain to idle, restart, wait ready, then enable.

Never restart non-idempotent tool transport underneath active work.

### Phase-1 quit posture

- `external`: quit leaves daemon/tunnel untouched.
- `launcher` UI Quit with active work: refuse cleanly and offer explicit Cancel-and-Quit through the existing cancellation path.
- OS logout/reboot/SIGTERM: disable → bounded drain → cancel-browser-turns on expiry → graceful shutdown → hard-deadline cleanup of positively owned children → BrowserHost/descriptor cleanup → exit.

### Phase-1 autostart posture

Freeze autostart during manual integrated qualification. Do not let Electron login-item reconciliation coexist with the current coordinator.

Only after manual integrated qualification should a packaged-build single-authority autostart/reboot proof occur. Electron-native login autostart is the preferred eventual simplification, but remains unqualified.

## Smallest implementation sequence when authorized

### Slice 1 — ownership, admission and shared readiness foundation

- add/validate `runtimeOwner` in config;
- make every supervisor mutating entry point inert/refusing in `external` mode;
- add `turns_enabled` and authenticated `/admin/enable|disable`;
- gate `/v1/responses` and `/compact`, not `/v1/models`;
- keep `/healthz` BrowserHost-independent and keep `accepting_turns` drain-only;
- share the existing qualified BrowserHost startup proof rather than clone it;
- launcher startup becomes daemon-disabled → BrowserHost proof → tunnel → enable → READY;
- keep autostart frozen;
- keep broad automatic daemon/tunnel recovery disabled for initial launcher qualification.

This slice must be behavior-neutral for the existing external path.

### Slice 2 — launcher quit/termination contract

- normal idle launcher quit;
- active UI Quit refuses and offers Cancel-and-Quit;
- OS/process termination preserves disable/drain/cancel-before-shutdown before hard owned cleanup;
- deterministic no-orphan/no-stale-descriptor tests.

### Slice 3 — bounded live qualification

1. external-mode zero-mutation proof;
2. launcher daemon up with turns disabled: `/v1/models` works and `/v1/responses` returns legible 503;
3. BrowserHost proof → tunnel → enable → aggregate READY;
4. ordinary read-only ChatGPT-Web turn;
5. Goose Native/tool-capable turn with exactly one submission and one broker invocation;
6. continuation/multi-turn with no stale execution reuse;
7. active UI Quit refusal and explicit Cancel-and-Quit proof;
8. OS-style termination proof with cancellation before exit and no orphan processes/descriptor;
9. reopen and rollback to external path.

### Slice 4 — packaged autostart/cutover

Only after Slice 3 passes:

- disable old coordinator before enabling Electron login authority;
- packaged reboot/login proof with exactly one login-visible authority;
- normal-path cutover;
- retain external path briefly as rollback.

### Slice 5 — deletion

Only after replacement proof:

- delete obsolete standalone lifecycle/launchd ownership machinery;
- simplify docs/tests/config accordingly;
- do not retain parallel recovery systems merely for historical symmetry.

## Phase 2 — browser-control dependency reduction

Separate from Phase 1.

Observation/reconciliation is already substantially Electron-native (`session.webRequest` and BrowserHost submission/network evidence). The reviewed direction is therefore:

1. finish/consolidate native observation where useful;
2. keep one proven Playwright/CDP control path;
3. replace individual control primitives only when their exact waiting/submission semantics move atomically with them.

Do not treat `webContents.debugger` as removal of the DevTools failure class. Prefer genuinely native candidates such as `sendInputEvent`, native navigation/load events, narrow `executeJavaScript`, and existing `session.webRequest` evidence.

Do not replace Playwright auto-waiting with brittle polling.

## Remaining non-blocking investigation

Before enabling any launcher-owned **tunnel adoption/recovery** later, determine whether `tunnel-client runtimes cleanup/stop` sees a runtime started through `tunnel-client run --profile...`.

This is **not a blocker for Slice 1** because the reviewed ownership model forbids external adoption and initial launcher mode requires a clean explicit cutover/fresh owned start.

## Separate workstreams

- PR #31 — chronological evidence ledger.
- PR #32 / CGW-010 — large-context work.
- PR #33 — demand-start/resource policy; secondary optimization.
- Goose Control — belongs in `luke-m-selway/day-shift` and remains provider-agnostic.

## Stop boundary

The plan is ready for user review. Do not implement, cut over, delete old machinery, merge/rebase/reset, or mutate `fix/electron-native-liveness` until explicitly authorized.
