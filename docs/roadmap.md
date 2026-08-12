# goose-chatgpt-web roadmap

This file contains **current and next work only**. It is not a chronological engineering diary.

The exact pre-cleanup roadmap, including completed managed-Chrome and early tool-bridge milestones, is preserved at repository commit `76941119f33ec359c1d4b4b47f4d5c7df5b91c74`. See [`history/README.md`](history/README.md) before using older milestones for architecture archaeology.

## 1. Finish Electron response reliability

Status: **active**.

The Electron BrowserHost already supports real Goose → ChatGPT-Web turns and dependent continuations. Current qualification is focused on unattended response watching on hidden/task-bound Electron surfaces.

Acceptance:

- one real ordinary-Goose dependent continuation through native turn metadata;
- one unattended turn that crosses the previously observed response-watch failure boundary without a diagnostic second CDP client;
- dependent continuation after that long turn;
- focused/full tests and typechecks clean;
- no regression in helper heartbeat, turn cleanup, or BrowserHost surface ownership.

Do not reopen managed-Chrome or generic `browser_page` hypotheses without evidence from the actual failing production path.

## 2. Make BrowserHost startup deterministic

Status: **manual cold reconstruction proven; supervision not yet encoded**.

A complete cold shutdown and reconstruction has been proven with the dependency order:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

Next:

- create one canonical BrowserHost lifecycle interface/supervisor;
- use that same mechanism for manual start/restart and automatic post-login/reboot startup;
- add bounded first-use recovery that invokes the same mechanism rather than inventing a second launch path;
- make BrowserHost readiness prove disposable surface creation/selection, not only PID/descriptor/CDP existence;
- perform a reboot-equivalent proof: cold system → automatic reconstruction → ordinary Goose first turn → dependent continuation.

See [`runtime-lifecycle.md`](runtime-lifecycle.md).

## 3. Complete Goose naming migration

Status: **specified, implementation pending**.

Remove inherited outer-harness/product naming from runtime identifiers, package metadata, service labels, environment variables, connector actions, and ambiguous launcher scripts.

The word `Codex` is reserved for the actual Codex agent/ACP specialist deliberately invoked as a development worker.

Required migration targets are listed in [`naming.md`](naming.md). Do this mechanically after active Electron reliability changes are checkpointed so naming churn cannot obscure browser-behaviour debugging.

## 4. Return ChatGPT-Web to main-agent ownership

Status: **blocked on milestones 1–3 sufficiently stabilizing the runtime**.

Once Electron response reliability and deterministic startup are proven, use ChatGPT-Web High as the normal high-volume engineering/orchestration model again.

Delegation policy:

- main ChatGPT-Web parent owns architecture/integration;
- free workers handle bounded mechanical work;
- Codex agent is the normal strong coding/debugging specialist;
- when the parent + Codex stop materially narrowing a problem, use one fresh alternate-model-family differential diagnosis rather than extending the same speculative loop.

## 5. Resume Goose Control

Status: **deferred**.

Goose Control remains a Planner-facing connector/gateway into existing Goose sessions, separate from the ChatGPT-Web browser transport.

Do not resume implementation until the current Electron BrowserHost is reliable enough that Goose Control development can serve as useful endurance workload rather than becoming entangled with browser-runtime debugging.

The detailed deferred design is maintained in draft PR #25.

## Later / deferred

- further parallel ChatGPT-Web BrowserHost qualification;
- resource optimization of the BrowserHost/control plane after real reliability/resource baselines exist;
- any alternative BrowserHost technology only if it preserves the proven ownership/session/CDP contract and provides measured benefit.

Do not promote deferred research into current architecture without an explicit milestone decision.
