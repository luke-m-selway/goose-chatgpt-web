# Deferred Electron turn observability hardening

Status: **deferred design note; not current runtime behavior.**

This note records a future reliability improvement for the Electron BrowserHost path. It does not authorize changing the currently working response watcher, lifecycle coordinator, or BrowserHost runtime now.

## Motivation

The Electron migration gives the project access to stronger browser-side truth than a managed browser UI alone. Current reliability work has already removed some fragile UI-only assumptions:

- stop-button visibility is not authoritative model-generation state;
- after an assistant response has appeared, temporary response-DOM disappearance/remount is not by itself a terminal failure while browser/session control remains healthy;
- BrowserHost readiness is stronger than PID/descriptor/CDP existence and proves a real leased surface through the Node/Electron-as-Node helper path.

A later hardening milestone should go further and make turn state depend on several independent evidence layers instead of any single ChatGPT UI affordance.

## Target model

Future Electron turn observability should combine three evidence layers:

### 1. Renderer / control truth

Use BrowserHost/Electron/CDP signals to answer questions such as:

- does the task-bound `WebContents` still exist?
- is the renderer responsive and not crashed?
- is the BrowserHost control endpoint responsive?
- is CDP still responsive for the exact leased surface?
- has authenticated browser/session state been lost?

Renderer crash, sustained unresponsiveness, control/CDP loss, or authentication loss are strong failure signals.

### 2. Correlated browser-network truth

Where Electron/Chromium exposes stable browser-side request lifecycle events, correlate the active ChatGPT turn with evidence such as:

- request started;
- request still in flight;
- response/data activity observed;
- request completed;
- request failed.

The goal is browser-side transport observability, **not** reverse engineering or depending on an undocumented private ChatGPT protocol.

If Electron `session.webRequest` or equivalent shared hooks are used, centralize/multiplex them. Do not scatter competing listeners across unrelated components; Electron listener semantics and ownership must be verified before implementation.

### 3. Semantic UI truth

Continue to use the visible ChatGPT surface for meaning that only the UI can reliably provide, for example:

- the intended user message appeared;
- visible thinking/tool state is present;
- assistant response content materialized;
- final response became stable;
- a response-scoped completion affordance/state appeared.

Semantic UI state should complement renderer/network evidence rather than act as the sole liveness source.

## Intended turn-state reasoning

The eventual design should move toward explicit state reasoning such as:

```text
renderer/control healthy
        +
correlated request active or semantic generation activity
        =
still working
```

and:

```text
stable final assistant response
        +
response-scoped completion evidence
        (+ optional network completion corroboration)
        =
completed
```

while terminal failure should come from evidence such as:

- renderer gone/crashed or sustained unresponsive;
- BrowserHost control/CDP failure for the leased surface;
- correlated browser request failure;
- authenticated session loss;
- explicit ChatGPT error state;
- authoritative completion with no usable response.

Temporary DOM remount/disappearance alone is not terminal once a response has appeared.

## Watchdog direction

Prefer state/progress-aware watchdogs over elapsed-time assumptions.

A long turn that continues to show credible progress should not fail simply because a legacy generation timer expired. Wall-clock stage deadlines may remain as final failsafes where necessary, but they should not be the primary definition of model or browser state.

Preserve the original causal error when a terminal failure occurs.

## Constraints learned from current Electron qualification

Do not regress these findings while implementing the future design:

- do not treat stop-button visibility alone as authoritative generation state;
- do not treat temporary response-DOM disappearance after response appearance as automatic terminal failure;
- do not add a diagnostic second CDP observer as a normal runtime dependency; prior qualification showed that a second observer itself changed outcomes;
- do not use Bun-direct Playwright `connectOverCDP()` as authoritative BrowserHost-health evidence; the qualified BrowserHost helper/control path is Node/Electron-as-Node;
- do not move Goose conversation/session ownership into BrowserHost observability;
- do not move daemon/tunnel ownership into Electron;
- do not reverse engineer private ChatGPT request formats as a new provider contract.

## Scope boundary

This is a **future runtime-hardening milestone**, separate from:

- the documentation/naming cleanup in draft PR #26;
- Goose Control;
- ordered login/reboot autostart;
- future Rust/browser-host resource optimization in draft PR #23.

PR #26 may mention this item briefly as deferred work when reconciling the roadmap, but the implementation design and acceptance criteria belong here rather than in the documentation-cleanup PR.

## Suggested future acceptance criteria

Before declaring this hardening complete, a dedicated implementation milestone should demonstrate at least:

1. a healthy long-running turn remains alive without depending on a stop-button heuristic;
2. a temporary response-DOM remount after response appearance does not terminate the turn while renderer/control/network evidence remains healthy;
3. renderer/CDP or correlated network failure produces a prompt causal terminal error;
4. completion is detected from stable response-semantic evidence, optionally corroborated by browser-network completion;
5. no second diagnostic CDP observer is required;
6. tests cover the state transitions independently of live ChatGPT timing where practical;
7. ordinary Goose first turn and dependent separate `--resume` still pass after the change.

## Reconciliation rule

When this work is eventually resumed, start from the then-current proven Electron runtime and revalidate this proposal against current Electron APIs, BrowserHost code, and live evidence. This note preserves the design direction; it is not a patch to apply verbatim.
