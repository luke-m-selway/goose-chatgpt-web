# goose-chatgpt-web roadmap

This file contains **current and next work only**. The older chronological engineering diary remains in Git history at `dd44b74` and is historical, not a source of current lifecycle or priority instructions.

## Current runtime checkpoint — qualified

Status: **current/proven**, with named remaining reliability and lifecycle gaps.

- Electron BrowserHost ownership is BrowserHost-only.
- Responses daemon and Secure MCP Tunnel are independently supervised.
- Canonical lifecycle is proven: `tunnel ready → BrowserHost genuinely ready → daemon ready`, with reverse shutdown.
- BrowserHost readiness is proven through the descriptor-provided Node/Electron Node browser-helper path; Bun-direct Playwright/CDP is not authoritative.
- Ordinary Goose first turn and separate persisted-session `--resume` continuation are proven.
- Ordered macOS autostart is implemented with one login-visible coordinator that invokes canonical `lifecycle start`; daemon/tunnel launchd definitions live under the runtime home and remain launchd-supervised.
- The earlier failed in-task lifecycle/autostart proof was self-interference from the active BrowserHost-backed turn, not a general Electron regression.

Remaining lifecycle validation: **actual Mac reboot/login reconstruction is NOT RUN.** This remains an explicit operator-controlled validation item.

Draft PR #31's development runtime is deployed at
`7f99f187295135de1507c3fcd63aca08e9c01810` with passive flight recording enabled. Its native
liveness design/review has passed, ordinary multi-turn ChatGPT-Web use and native ChatGPT-Web
subagent delegation are established, and natural usage has established a genuine parent plus two
async ChatGPT-Web child topology with genuine three-surface overlap. Reliable parent-plus-two-child
completion is still **NOT QUALIFIED**.

A natural Day Shift workload exposed a browser-control self-interference defect: a timed-out
Playwright diagnostic could remain outstanding and overlap a later critical stage while the Electron
WebContents remained visibly alive and authenticated. `7f99f187...` removes routine launcher
Playwright diagnostics from the critical path, blocks stale same-trace diagnostic overlap, preserves
real `composer_ready` failures, and adds bounded composer/control telemetry. The first ordinary retry
of the workload that exposed the issue appeared to proceed normally after activation. See
[`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md).

## Current reliability phase — ordinary-use observation

The current reliability phase is ecological observation of ordinary work, not another designated
synthetic run.

Use ChatGPT-Web as a normal capable Goose parent:

- allow multiple consecutive parent turns;
- allow ordinary Goose Native tool use and meaningful bounded milestones;
- when another strong ChatGPT-Web model genuinely adds value, use at most **one ChatGPT-Web child at a time** for now, especially for diff review, adversarial review, independent diagnosis, or architecture/minimalism review;
- do not make parent + two simultaneous ChatGPT-Web children the routine pattern yet;
- do not stop healthy work to inspect or protect the passive recorder.

If another real failure occurs, preserve it and inspect the passive observation corpus first. Add
heavier instrumentation only if that corpus exposes a specific evidence gap.

Remaining reliability unknowns that do not block normal use:

- reliable parent + two child completion remains **NOT QUALIFIED**;
- two earlier outer Responses bodies failed roughly 603–606 seconds after the last successful tool-result continuation while the browser pages remained viable; the failing layer remains unlocalized;
- ChatGPT-native connection interruption and broker/tool-continuation orphaning remain known natural failure classes;
- pre-Goose-Native startup latency is worth measuring only if it remains disruptive;
- large-prompt attachment performance remains a later item; a natural incident measured about 21.2 seconds for a ~24.6k-character prompt versus about 2.8 seconds for a shorter control.

The retained deterministic and natural qualification tooling remains available, but another designated
run is not the current next action.

## Active feature work — Goose Control in Day Shift

Goose Control work has resumed in the separate Day Shift repository:

- GitHub: `luke-m-selway/day-shift`
- local: `/Users/luke/Documents/day-shift`

This repository does **not** own Goose Control implementation. The architectural boundary remains:

```text
ChatGPT Planner
  ↕
Goose Control
  ↕
ordinary Goose harness
  ↕
providers / tools / delegates / ACP specialists
  ↕
ChatGPT-Web is one provider beneath Goose
```

Goose Control should remain provider-agnostic. Do not put ChatGPT-Web BrowserHost recovery,
concurrency policy, or transport-specific orchestration into the Goose Control protocol.

[`goose-control-plan.md`](goose-control-plan.md) remains useful design history/context, but current
implementation truth belongs to the Day Shift repository.

## Separate remaining runtime validation

At an appropriate operator-controlled boundary, perform the actual macOS reboot/login reconstruction proof:

```text
reboot/login
  → ordered autostart reconstructs runtime
  → canonical lifecycle healthy
  → ordinary Goose first turn
  → separate dependent --resume
```

Do not perform this from a Goose turn that depends on the runtime being restarted.

## Retained qualification procedure

[`chatgpt-web-concurrency-qualification.md`](chatgpt-web-concurrency-qualification.md) retains the
committed qualification procedures and earlier evidence. Its deployed-revision status text predates
the `7f99f187...` closeout; use
[`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md) for current runtime status.

[`chatgpt-web-flight-recorder.md`](chatgpt-web-flight-recorder.md) remains authoritative for passive
recorder behavior, privacy, and storage boundaries.
