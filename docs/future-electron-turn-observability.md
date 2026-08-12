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

## Independent live evidence: long-running Goose Native invocation

A ChatGPT-Web Electron session on 2026-08-12 produced the same terminal error seen during failed continuation:

```text
chatgpt_browser_control_unresponsive
```

but this occurrence followed a **long-running Goose Native tool invocation**, not merely the act of advancing to a second user prompt.

The last visible tool command created a disposable local proof environment and ended with a foreground service:

```bash
exec env GOOSE_SERVER__SECRET_KEY="<redacted>" \
  goose serve --host 127.0.0.1 --port "$PORT"
```

A healthy `goose serve` process is expected to remain alive. The active ChatGPT response therefore stayed open waiting on a long-running outer-harness command.

Current post-send liveness still probes only:

```ts
page.evaluate(() => document.readyState)
```

at 5-second intervals, bounds each probe to 3 seconds, and terminates after two consecutive failures. The browser worker races that watcher against the entire response/tool loop, so the watcher remains armed while ChatGPT is waiting for a long-running Goose Native call.

This incident does **not** prove the foreground service caused CDP/control loss. A healthy task-bound renderer should remain controllable while an MCP call is pending. It instead provides independent evidence that the current Electron liveness mechanism can become terminal during a sustained active tool turn and must be investigated on its own merits.

The full incident note is on PR #29 at:

`docs/future-long-running-tool-liveness-incident.md`

Keep the fault boundaries distinct:

```text
cross-transport continuation defect
  ≠
Electron post-send control-liveness defect
```

The Electron defect may amplify the continuation failure, but cannot explain the managed-Chrome continuation history.

The incident also exposes a separate contract to qualify: `codex_exec` advertises that long-running commands return a native `session_id`, but when standalone Goose exposes only its plain `shell` capability, the bridge currently forwards only `{ command }` and cannot impose `yield_time_ms`, TTY/session semantics, or a bounded session handoff. Future work should verify the real Goose 1.45 command schema and make this public behavior truthful rather than allowing a foreground service to wedge an MCP invocation indefinitely.

Do not respond by merely increasing the liveness timeout. Determine whether the renderer really became unresponsive, whether the helper/control path stalled while the renderer remained healthy, or whether two `document.readyState` probe failures are simply insufficient terminal evidence.

## Constraints learned from current Electron qualification

Do not regress these findings while implementing the future design:

- do not treat stop-button visibility alone as authoritative generation state;
- do not treat temporary response-DOM disappearance after response appearance as automatic terminal failure;
- do not add a diagnostic second CDP observer as a normal runtime dependency; prior qualification showed that a second observer itself changed outcomes;
- do not use Bun-direct Playwright `connectOverCDP()` as authoritative BrowserHost-health evidence; the qualified BrowserHost helper/control path is Node/Electron-as-Node;
- do not move Goose conversation/session ownership into BrowserHost observability;
- do not move daemon/tunnel ownership into Electron;
- do not reverse engineer private ChatGPT request formats as a new provider contract.

## Fresh-turn tool-discovery latency to investigate

A repeated visible delay has been observed when a fresh ChatGPT-Web Temporary Chat begins: ChatGPT can display an activity label such as **“Searching Available Todo Tools”** for a long period before useful work continues.

The cause is **not yet proven**. Do not document this as “todo-list creation” or as a bridge defect without evidence.

When this future observability/performance work is resumed, correlate one or more occurrences across the full browser/tool path and determine:

- whether the visible activity corresponds to ChatGPT-side app/tool discovery, a `Goose Native` tool inventory/search request, a tunnel round trip, or another browser-side operation;
- whether the discovery repeats for every fresh Temporary Chat/new logical Goose turn;
- how much wall-clock latency it adds before the first useful model/tool action;
- whether any repeated work is controlled by this project and can be safely cached, pre-advertised, or otherwise avoided without widening tool authority or relying on stale schemas;
- whether the delay is intrinsic ChatGPT behavior that the bridge should merely observe rather than attempt to optimize.

Use correlated daemon/tunnel/browser-helper/BrowserHost evidence where available rather than inferring the cause from the ChatGPT UI label alone. Any optimization must preserve fresh-turn isolation, current Goose tool authority, fail-closed connector behavior, and schema correctness.

This is a performance/observability investigation, not justification for reusing ChatGPT conversation history across Goose turns.

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
7. ordinary Goose first turn and dependent separate `--resume` still pass after the change;
8. the repeated “Searching Available Todo Tools” delay is measured and causally attributed before any optimization is attempted, with project-controlled avoidable latency reduced only if doing so preserves the existing tool/security contract;
9. a controlled long-running Goose Native command remains healthy substantially beyond the current liveness-probe window, and the `codex_exec` / `session_id` contract is proven against the actual Goose command capability rather than inferred from richer Codex-style tools.

## Reconciliation rule

When this work is eventually resumed, start from the then-current proven Electron runtime and revalidate this proposal against current Electron APIs, BrowserHost code, and live evidence. This note preserves the design direction; it is not a patch to apply verbatim.