# Documentation map

This directory is the authoritative handoff for the current Goose-first ChatGPT-Web runtime and its active architecture-planning workstream.

## Status labels

- **current/proven** — implemented and exercised against the named/current revision; safe to use as the present operating contract.
- **active design** — current planning direction, not yet implementation truth.
- **provisional** — a current design detail with a named proof/decision outstanding.
- **deferred** — intentionally later work.
- **historical** — superseded evidence retained in Git/PR history; not an operating instruction.

## Current/proven runtime sources

- [`architecture.md`](architecture.md) — current runtime boundary plus clearly separated integrated-app design direction.
- [`runtime-lifecycle.md`](runtime-lifecycle.md) — current lifecycle, actual reboot result, and rollback-capable lifecycle migration constraints.
- [`security-model.md`](security-model.md) — trust/capability boundaries that must survive ownership consolidation.
- [`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md) and PR #31 — reliability/evidence history.
- [`../AGENTS.md`](../AGENTS.md) — mandatory runtime/safety rules for agents.

Current activated local diagnostic checkpoint is `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`), a diagnostic-only child of qualified behavioral baseline `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`). This PR #35 documentation branch does not contain that local implementation lineage.

## Actual reboot/login status

The old `actual reboot/login reconstruction is NOT RUN` statement is superseded.

On 2026-08-24 the full reboot/login proof was run:

- automatic ChatGPT-Web infrastructure reconstruction did **not** occur;
- manual canonical bring-up was required and succeeded;
- therefore autostart/reboot reconstruction is **RUN — FAIL / NOT QUALIFIED**, while manual post-reboot reconstruction is proven;
- the first post-reboot manual ChatGPT-Web run was materially healthier at startup and completed substantial tool-backed work, but later failed with a secondary `chatgpt_retry_circuit_open` guard after an unresolved causal failure.

Do not describe reboot as having fixed ChatGPT-Web.

## Active planning authority

PR #35 and [`cgw-foundation-implementation-plan-2026-08-21.md`](cgw-foundation-implementation-plan-2026-08-21.md) are the current planning authority.

The governing direction is now a **self-contained ChatGPT-Web provider application** behind a stable Goose-facing provider contract:

```text
primary:
one application
one top-level owner
one restart boundary
one readiness contract

secondary:
minimise idle resources where that stays simple
```

Electron is the current implementation candidate, not the replaceability boundary. Goose remains the durable agent/session/tool/context authority.

The earlier design rule that Electron must permanently own BrowserHost only and never supervise daemon/tunnel is superseded as a planning constraint. It remains current implementation truth only until the integrated path is proven.

## Migration posture

The redesign is explicitly **parallel and rollback-capable**.

- keep the existing `0b89d5e` provider stack usable during development;
- build the integrated application mode alongside it;
- preserve the current Goose-facing Responses contract in Phase 1 unless scouting proves a better native boundary;
- qualify startup/readiness, read-only turn, tool-capable turn, continuation, quit/reopen reconstruction and bounded cutover before making the integrated path normal;
- retain the old path briefly as rollback;
- delete independent-supervision machinery only after replacement proof.

Likewise, any later Playwright/CDP reduction should migrate browser-control stages incrementally rather than replace the automation stack in one cut.

The design/Opus review must reject plans that require ChatGPT-Web to be unavailable throughout the rebuild. Development downtime should be limited to bounded qualification/cutover windows.

## Workstream boundaries

- PR #31 remains the chronological incident/evidence ledger.
- PR #32 / CGW-010 large-context work remains separate unless a dependency becomes unavoidable.
- PR #33 demand-start/resource goals are demoted to a secondary optimization inside the single-owner application lifecycle.
- Goose Control implementation belongs in `luke-m-selway/day-shift`; do not fold ChatGPT-Web-specific recovery/orchestration into it.

When historical material conflicts with these current planning surfaces, preserve the history but follow the current authority above.
