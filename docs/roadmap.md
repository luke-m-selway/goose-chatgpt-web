# goose-chatgpt-web roadmap

This file contains **current and next work only**. It is not a chronological engineering diary.

The exact pre-cleanup roadmap, including completed managed-Chrome and early tool-bridge milestones, is preserved at repository commit `76941119f33ec359c1d4b4b47f4d5c7df5b91c74`. See [`history/README.md`](history/README.md) before using older milestones for architecture archaeology.

## 1. Finish Electron response reliability

Status: **active**.

The Electron BrowserHost already supports real Goose → ChatGPT-Web turns and dependent continuations. Current qualification is focused on unattended response watching on hidden/task-bound Electron surfaces.

Acceptance:

- one real ordinary-Goose dependent continuation through native turn metadata on the current reconstructed runtime;
- one unattended turn that crosses the previously observed response-watch failure boundary without a diagnostic second CDP client;
- dependent continuation after that long turn;
- focused/full tests and typechecks clean;
- no regression in helper heartbeat, turn cleanup, or BrowserHost surface ownership.

Known unresolved detail: the current lifecycle-reassertion experiment still needs production-path live proof. Until that proof exists, do not describe the response-watch problem as fixed merely because focused tests pass.

Do not reopen managed-Chrome or generic `browser_page` hypotheses without evidence from the actual failing production path.

## 2. Make BrowserHost startup deterministic

Status: **manual cold reconstruction proven; supervision/automatic trigger not yet encoded**.

A complete cold shutdown and reconstruction has been proven with the safe observed sequence:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

This is the canonical order for now. The proof established that the sequence works; it did **not** establish that every other order is technically impossible.

Still to decide/prove:

- whether normal startup is triggered at macOS login, lazily on the first ChatGPT-Web request, or uses login startup plus first-use recovery;
- the exact canonical BrowserHost service/CLI name and supervision mechanism;
- the exact non-secret environment/runtime-home/build identity that supervisor fixes so repeated launches are equivalent;
- whether BrowserHost readiness becomes a formal health command/endpoint or remains a composed readiness check;
- a reboot-equivalent reconstruction through the final supervisor;
- ordinary Goose first turn + dependent continuation from that final automatically reconstructed state;
- cross-platform behavior if/when the standalone Goose deployment is qualified beyond macOS.

Next:

- create one canonical BrowserHost lifecycle interface/supervisor;
- use that same mechanism for manual start/restart and automatic startup/recovery;
- add bounded first-use recovery only by invoking that same mechanism rather than inventing a second launch path;
- make BrowserHost readiness prove disposable surface creation/selection, not only PID/descriptor/CDP existence;
- perform the reboot-equivalent proof once the trigger/supervisor is selected.

See [`runtime-lifecycle.md`](runtime-lifecycle.md) for the explicit proven-vs-provisional register.

## 3. Complete Goose naming migration

Status: **conceptual naming settled; exact persisted/ABI rename implementation pending**.

Remove inherited outer-harness/product naming from runtime identifiers, package metadata, service labels, environment variables, connector actions, and ambiguous launcher scripts.

The word `Codex` is reserved for the actual Codex agent/ACP specialist deliberately invoked as a development worker, or for an explicitly labeled historical/legacy identifier being migrated.

Required migration directions and still-open exact identifier decisions are listed in [`naming.md`](naming.md). Do this mechanically after active Electron reliability changes are checkpointed so naming churn cannot obscure browser-behaviour debugging.

Before declaring the naming migration complete, prove that old persisted config/service/tunnel/connector state is either migrated transactionally or explicitly retired, and that the current docs contain no unexplained inherited `codex*` operator/API name.

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
