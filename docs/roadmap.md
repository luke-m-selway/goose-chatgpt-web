# goose-chatgpt-web roadmap

This file contains **current and next work only**. The older chronological engineering diary remains in Git history at `dd44b74` and is historical, not a source of current lifecycle or priority instructions.

## Current runtime checkpoint — qualified base, ecological gaps remain

Status: **current/proven**, with named remaining reliability and lifecycle gaps.

- Electron BrowserHost ownership is BrowserHost-only.
- Responses daemon and Secure MCP Tunnel are independently supervised in the current deployed lifecycle.
- Canonical lifecycle is proven: `tunnel ready → BrowserHost genuinely ready → daemon ready`, with reverse shutdown.
- BrowserHost readiness is proven through the descriptor-provided Node/Electron Node browser-helper path; Bun-direct Playwright/CDP is not authoritative.
- Ordinary Goose first turn and separate persisted-session `--resume` continuation are proven.
- Ordered macOS autostart is implemented with one login-visible coordinator that invokes canonical `lifecycle start`; daemon/tunnel launchd definitions live under the runtime home and remain launchd-supervised.
- The earlier failed in-task lifecycle/autostart proof was self-interference from the active BrowserHost-backed turn, not a general Electron regression.

Remaining lifecycle validation: **actual Mac reboot/login reconstruction is NOT RUN.** This remains an explicit operator-controlled validation item.

Draft PR #31's deployed development runtime remains `7f99f187295135de1507c3fcd63aca08e9c01810` with passive flight recording enabled. Later PR #31 commits are documentation/evidence supplements unless explicitly activated as runtime revisions.

Native liveness design/review has passed, ordinary multi-turn ChatGPT-Web use and native ChatGPT-Web subagent delegation are established, and natural usage has established a genuine parent plus two async ChatGPT-Web child topology with genuine three-surface overlap. Reliable parent-plus-two-child completion is still **NOT QUALIFIED**.

The natural Day Shift workload that exposed a timed-out Playwright diagnostic overlapping a later critical browser stage was repaired by `7f99f187...`: routine launcher Playwright diagnostics were removed from the critical path, stale same-trace diagnostic overlap is blocked, real composer/control failures are preserved, and bounded telemetry remains available. See `chatgpt-web-reliability-closeout.md`.

Late 2026-08-14 ecological evidence is preserved separately in `chatgpt-web-ecological-supplement-2026-08-14.md` so the deployed-checkpoint closeout does not silently absorb later incidents.

## Current reliability phase — ordinary-use observation

The current reliability phase is ecological observation of ordinary work, not another designated synthetic run.

Use ChatGPT-Web as a normal capable Goose parent:

- allow multiple consecutive parent turns;
- allow ordinary Goose Native tool use and meaningful bounded milestones;
- when another strong ChatGPT-Web model genuinely adds value, use at most **one ChatGPT-Web child at a time** for now, especially for diff review, adversarial review, independent diagnosis, or architecture/minimalism review;
- do not make parent + two simultaneous ChatGPT-Web children the routine pattern yet;
- do not stop healthy work to inspect or protect the passive recorder.

If another real failure occurs, preserve it and inspect the passive observation corpus first. Add heavier instrumentation only if that corpus exposes a specific evidence gap.

Successful turns are part of the evidence set. A late-evening fresh ChatGPT-Web Goose session accepted a normal follow-up while its accumulated context was still relatively small and remained productive through checkpointing, Goose tool use, and two bounded free-worker strands. That is positive ecological evidence for ordinary continuation; it does not prove the large-context hypothesis below.

### Diagnosed stale execution-key replay defect

A genuine pre-reconstruction BrowserHost descriptor-missing failure could remain settled in the daemon's per-execution-key session registry. After BrowserHost had been reconstructed and canonical readiness passed, later identical requests could replay that old error without leasing BrowserHost. A uniquely identified fresh execution succeeded without daemon restart.

Required invariant for the bounded repair:

- a genuinely new Goose chat/turn must receive fresh provider execution identity even when its prompt text is byte-for-byte identical to an earlier chat;
- prompt-string equality must not reuse an old settled error, retry circuit, Temporary Chat lineage, or provider execution key;
- deliberate idempotency requires explicit caller-owned identity rather than inferred prompt equality;
- transient descriptor/readiness failures should not poison future new executions for the registry TTL after BrowserHost recovery.

Keep this separate from generic retries, PR #32 large-context transport, and PR #33 provider-demand startup.

Remaining reliability unknowns that do not block normal use:

- reliable parent + two child completion remains **NOT QUALIFIED**;
- two earlier outer Responses bodies failed roughly 603–606 seconds after the last successful tool-result continuation while the browser pages remained viable; the failing layer remains unlocalized;
- ChatGPT-native connection interruption and broker/tool-continuation orphaning remain known natural failure classes;
- pre-Goose-Native startup latency is worth measuring only if it remains disruptive;
- large-prompt attachment performance remains a later item; a natural incident measured about 21.2 seconds for a ~24.6k-character prompt versus about 2.8 seconds for a shorter control.

The retained deterministic and natural qualification tooling remains available, but another designated run is not the current next action.

## Design track — large-context continuation (PR #32)

Draft PR #32 is documentation-only and preserves the hypothesis that accumulated authoritative Goose context should not be forced forever through one growing ChatGPT browser-composer submission.

Current evidence is deliberately two-sided:

- negative: same-session send failures, severe continuation/auto-compaction failures, and materially slower large prompt attachment in natural use;
- positive: a fresh session and normal follow-up remained healthy while current context was still relatively small.

This strengthens the hypothesis that context size is a reliability variable but does **not** prove causality or a threshold.

Preferred direction if evidence continues to support it:

```text
small context
  -> existing inline composer transport

large context
  -> immutable provider-owned context artifact
  -> small bootstrap message
  -> bounded sequential context reads
  -> EOF/complete proof
  -> normal task execution
```

Goose remains authoritative for context and compaction. Do not scrape Goose SQLite, invent provider memory, use one giant tool result, or widen read-only local access accidentally.

Execution identity remains independent of prompt text; the stale descriptor-error replay is explicitly excluded from the large-context hypothesis.

See PR #32 docs:

- `chatgpt-web-large-context-externalization.md`
- `chatgpt-web-large-context-ecological-evidence.md`

## Design track — low-resource provider-demand BrowserHost lifecycle (PR #33)

Draft PR #33 is documentation-only and preserves the startup/shutdown UX direction for ChatGPT-Web as a Goose companion provider.

Resource goal: waste the fewest computer resources when ChatGPT-Web is unused without creating per-chat browser churn or a second orchestration framework.

Preferred target:

```text
Goose closed
  -> no ChatGPT-Web processes kept alive solely for Goose

Goose open, ChatGPT-Web unused
  -> keep only the minimum ingress/control component needed for lazy activation
  -> avoid eagerly running Electron/Chromium where a clean Goose lifecycle trigger permits it

first ChatGPT-Web use
  -> lazily ensure provider dependencies
  -> construct/reconstruct BrowserHost only when truly absent
  -> canonical readiness proof
  -> reuse BrowserHost across chats/turns for the Goose application lifetime

Goose exits
  -> orderly ChatGPT-Web companion-runtime shutdown
```

Do **not** make ChatGPT-Web an MCP extension merely to obtain a session-start trigger. It is provider infrastructure. Do not start/stop Electron per chat.

Before implementation, inspect Goose's actual application/provider lifecycle. If Goose provides a clean native trigger that permits zero ChatGPT-Web provider processes until selection, prefer it. Otherwise a small ingress daemon may remain while Goose is open so the first request can demand-start the heavy BrowserHost. Do not invent a second supervisor just to eliminate a small idle process.

The diagnosed stale execution-key replay defect is **not** a PR #33 BrowserHost-demand problem. True BrowserHost absence may trigger narrow reconstruction; healthy BrowserHost plus stale settled error belongs to PR #31.

See PR #33 docs:

- `chatgpt-web-demand-browserhost-start.md`
- `chatgpt-web-demand-browserhost-resource-policy.md`

## Active feature work — Goose Control in Day Shift

Goose Control work continues in the separate Day Shift repository:

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

Goose Control should remain provider-agnostic. Do not put ChatGPT-Web BrowserHost recovery, concurrency policy, retry identity, or transport-specific orchestration into the Goose Control protocol.

`goose-control-plan.md` remains useful design history/context, but current implementation truth belongs to the Day Shift repository.

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

`chatgpt-web-concurrency-qualification.md` retains the committed qualification procedures and earlier evidence. Its deployed-revision status text predates the `7f99f187...` closeout; use `chatgpt-web-reliability-closeout.md` plus `chatgpt-web-ecological-supplement-2026-08-14.md` for current reliability status/evidence.

`chatgpt-web-flight-recorder.md` remains authoritative for passive recorder behavior, privacy, and storage boundaries.
