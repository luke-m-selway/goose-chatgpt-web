# Documentation map

This directory is the authoritative handoff for the current Goose-first ChatGPT-Web runtime and the reviewed integrated-runtime implementation plan.

## Status labels

- **current/proven** — implemented and exercised against the named/current revision.
- **reviewed plan** — passed current-source scouting plus fresh adversarial review, but is not implementation truth yet.
- **provisional** — a design detail with a named proof/decision outstanding.
- **deferred** — intentionally later work.
- **historical** — superseded evidence retained in Git/PR history; not an operating instruction.

## Current/proven runtime sources

- [`architecture.md`](architecture.md) — current runtime plus reviewed target architecture.
- [`runtime-lifecycle.md`](runtime-lifecycle.md) — current lifecycle/reboot evidence plus reviewed ownership/readiness/cutover contract.
- [`security-model.md`](security-model.md) — current trust boundaries plus fail-closed ownership requirements.
- [`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md) and PR #31 — reliability/evidence history.
- [`../AGENTS.md`](../AGENTS.md) — mandatory runtime/safety rules for implementation agents.

Current activated local diagnostic checkpoint is `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`), a diagnostic-only child of qualified behavioral baseline `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`). This PR #35 documentation branch does not contain or reconcile that local implementation lineage.

## Actual reboot/login status

The full reboot/login proof was run on 2026-08-24.

- automatic ChatGPT-Web infrastructure reconstruction: **FAIL / NOT QUALIFIED**;
- manual canonical bring-up: **PASS**;
- first post-reboot manual ChatGPT-Web run had materially healthier startup/control behavior and substantial successful tool-backed work, then surfaced `chatgpt_retry_circuit_open` after an unresolved causal failure.

The old `reboot proof NOT RUN` status is superseded. Do not claim reboot fixed ChatGPT-Web.

## Planning authority and status

PR #35 and [`cgw-foundation-implementation-plan-2026-08-21.md`](cgw-foundation-implementation-plan-2026-08-21.md) are the current planning authority.

The mandatory pre-implementation sequence is complete:

1. documentation/evidence reconciliation;
2. current fork + current upstream inspection;
3. exact-local `0b89d5e` Ox scout;
4. coherent architecture/current→target diff;
5. fresh Opus adversarial review (`REVISE`);
6. reconciliation of the Opus findings.

The workstream is now at the explicit **STOP-before-implementation** boundary.

## Reviewed Phase-1 direction

Primary goal:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

Secondary goal: minimise idle resources only where that stays simple.

Key reviewed decisions:

- reuse/adapt the existing Electron `RuntimeSupervisor`; do not build a second supervisor;
- add persisted `runtimeOwner = external | launcher`;
- `external` mode is completely non-mutating for daemon/tunnel, including on quit;
- launcher ownership begins only after explicit operator-controlled transfer;
- shared qualified BrowserHost startup proof remains authoritative;
- continuous READY also includes a bounded non-destructive BrowserHost-ready predicate;
- launcher-owned startup is BrowserHost proof → daemon/broker → tunnel → aggregate READY;
- automatic daemon restart is disabled in initial launcher mode;
- tunnel must not restart underneath active/non-idempotent work;
- launcher quit is terminating with bounded drain + hard owned-child cleanup deadline;
- autostart is frozen until manual integrated qualification, then proven only in a packaged single-authority reboot test;
- existing `0b89d5e` path remains available as rollback until replacement proof.

## Phase 2 boundary

Browser-control redesign remains separate.

Observation/reconciliation is already substantially Electron-native. Prefer consolidating that observation first and keep one proven Playwright/CDP control path until individual controls can be replaced with their waiting/exact-once semantics preserved atomically.

Do not assume `webContents.debugger` removes the DevTools failure family; prefer genuinely native primitives such as `sendInputEvent`, native navigation/load events, narrow `executeJavaScript`, and `session.webRequest` where appropriate.

## Workstream boundaries

- PR #31 — chronological incident/evidence ledger.
- PR #32 / CGW-010 — separate large-context workstream.
- PR #33 — demand-start/resource policy; secondary optimization.
- Goose Control — belongs in `luke-m-selway/day-shift` and remains provider-agnostic.

When historical material conflicts with the current planning surfaces above, preserve history but follow the current authority.
