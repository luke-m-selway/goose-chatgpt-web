# goose-chatgpt-web roadmap

This file contains **current and next work only**. Historical engineering evidence remains in Git history and PR #31.

## Current runtime checkpoint

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`).
Qualified behavioral baseline: `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`).

`0b89d5e` is diagnostic-only. Do not attribute behavioral reliability changes to it.

Already-qualified guarantees remain closed and must survive redesign:

- CGW-009 exact-once submission — CLOSED / live-proved;
- Gate 2A semantic Markdown reconciliation — CLOSED / qualified;
- Gate 2B exact thread-error classification — CLOSED / qualified;
- CGW-017 progress-vs-liveness — CLOSED / live-qualified;
- CGW-013 verification split — CLOSED;
- CGW-007 retry-claim responsiveness — CLOSED / qualified;
- residual transport-terminal execution retirement — CLOSED / qualified at `6d4bea1`.

CGW-006's historical ~600-second absolute streaming-body lifetime defect has already been repaired upstream in Goose 1.46.0. Do not reimplement it locally from the old plan without a specific unresolved dependency.

## Reboot/autostart proof

The full macOS reboot/login proof has now been run.

Result: **FAIL / NOT QUALIFIED for automatic reconstruction**.

- ChatGPT-Web infrastructure did not reconstruct automatically after login.
- Manual canonical bring-up was required and succeeded.
- The first post-reboot manual ChatGPT-Web turn showed much healthier startup/control behavior and completed substantial real work, but later surfaced `chatgpt_retry_circuit_open` after an unresolved causal failure.

The old `reboot proof NOT RUN` status is superseded. Do not claim reboot fixed ChatGPT-Web.

## Active priority — coherent architecture design before implementation

Do not start implementation from the old issue order.

Required planning sequence:

1. reconcile current planning/evidence documentation;
2. inspect current fork implementation and current upstream;
3. collect bounded local-agent scouting for ownership, browser-control and invariant maps;
4. produce one coherent proposed architecture and staged migration plan;
5. produce a precise current → proposed architecture/code ownership diff;
6. send design + diff + evidence to a **fresh Opus** agent for adversarial pre-implementation review;
7. reconcile Opus findings into the implementation plan;
8. **STOP before implementation** unless the user explicitly authorizes it.

## Governing architectural direction

Primary goal:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

The ChatGPT-Web application should internally own/supervise the Responses endpoint, authenticated browser, browser surfaces/automation, ChatGPT-specific execution/recovery, Goose Native bridge, MCP/tunnel machinery, helper children, health/readiness and reconstruction.

Goose remains one separate application and the durable authority for sessions/history, context/compaction, tools/approvals, delegation and project execution.

The likely stable Goose-facing contract remains Responses-compatible HTTP/SSE unless scouting establishes a materially better native provider boundary. MCP remains the likely reverse tool path.

Resource minimisation/demand-start is secondary. Retain lazy startup only when it stays simple under the single application owner.

## Phase 1 to evaluate — consolidate lifecycle ownership

Keep browser behavior and the Goose-facing provider contract as unchanged as practical while moving top-level supervision into the ChatGPT-Web application.

Desired result:

```text
open ChatGPT-Web
  → app starts/supervises required children
  → app reaches one READY state
```

Internal child processes remain allowed. Independent operator-owned lifecycle should disappear only after app-owned startup, readiness, shutdown and crash recovery are proven.

## Parallel migration / availability rule

The redesign must be rollback-capable and must **not** require prolonged ChatGPT-Web downtime.

```text
existing provider path        remains available
         │
         ├── `0b89d5e` baseline / rollback
         │
new integrated app path       built alongside it
```

Integrated-mode proof gates:

1. app starts all required internal infrastructure;
2. health/readiness passes;
3. ordinary read-only ChatGPT-Web turn passes;
4. Goose Native/tool-capable turn passes;
5. continuation/multi-turn passes;
6. quit/reopen reconstruction passes;
7. bounded cutover to normal path;
8. old path retained briefly as rollback;
9. old independent-supervision machinery deleted only after replacement proof.

The planning and Opus review should reject any design that requires ChatGPT-Web to be unavailable throughout the rebuild.

## Phase 2 to evaluate — reduce Playwright/CDP critical-path dependence

This is separate from lifecycle consolidation.

Trace `df0fa0069ad9` materially narrowed one severe stall toward the shared Playwright-client ↔ Chromium DevTools serving/control segment while Electron main-loop/control and renderer evidence remained healthy. This justifies architectural review, not a blanket verdict that CDP is always causal.

Evaluate moving browser stages one at a time to Electron-owned facilities where this reduces complexity and preserves reliability:

1. navigation/readiness;
2. effort selection;
3. Goose Native attachment;
4. prompt insertion;
5. submission;
6. response observation;
7. tool continuation;
8. completion/error observation.

Keep the old path as reference/diagnostic during migration. Do not replace Playwright auto-wait behavior with fragile custom polling.

## Separate workstreams

- PR #31 — chronological evidence ledger.
- PR #32 / CGW-010 — large-context work; keep separate unless unavoidable dependency.
- PR #33 — demand-start/resource policy; now secondary optimization under single-owner architecture.
- Goose Control — belongs in `luke-m-selway/day-shift`; do not use it to emulate or repair ChatGPT-Web internals.

## Stop boundary

No integrated-app implementation, destructive reconciliation, old-path deletion, merge, rebase, reset or cutover is authorized by this roadmap. Finish scouting, design, architecture diff and Opus adversarial review first, then return the reconciled plan for user review.
