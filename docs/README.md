# Documentation map

This directory is the authoritative handoff for the current Goose-first runtime and active project work.

## Status labels

- **current/proven** — implemented and exercised against the named/current revision; safe to use as the present operating contract.
- **active** — current implementation or qualification work; design decisions are current, but implementation/proof may not be complete yet.
- **provisional** — a current design detail that still has an explicitly named proof or decision outstanding.
- **deferred** — intentionally later work, not a first-proof requirement.
- **historical** — superseded engineering evidence retained in Git/old PRs; not an operating instruction.

## Current/proven runtime documentation

- [`../README.md`](../README.md) — current project shape and status.
- [`architecture.md`](architecture.md) — ownership and request/tool flow.
- [`runtime-lifecycle.md`](runtime-lifecycle.md) — canonical lifecycle, BrowserHost readiness, macOS autostart, and remaining reboot proof.
- [`security-model.md`](security-model.md) — current trust/capability boundaries.
- [`../AGENTS.md`](../AGENTS.md) — mandatory runtime/safety rules for agents.

The qualified runtime base is the Electron checkpoint `c624274` plus current-main autostart commit `dd44b74`.

## Active qualification workstream

- [`chatgpt-web-subagents.md`](chatgpt-web-subagents.md) — qualification record for Goose-native ChatGPT-Web children under the Electron BrowserHost. The capability is **not yet proven**; the next test is one named-recipe/source-only ChatGPT-Web child. Until the documented proofs pass, do not claim recursive BrowserHost concurrency or parallel ChatGPT-Web child fan-out as qualified.

## Active product milestone

- [`goose-control-plan.md`](goose-control-plan.md) — Goose Control remains the next product capability. Its backend is settled on authenticated loopback Goose ACP; its first Planner-facing proof is a private GPT Action calling a narrow authenticated HTTPS REST/OpenAPI facade.
- [`roadmap.md`](roadmap.md) — current and next work only, including the focused ChatGPT-Web subagent qualification.

## Provisional / not yet proven

The actual Mac **reboot/login → automatic reconstruction → ordinary Goose first turn → separate dependent `--resume`** proof has not been run. Ordered autostart is implemented and live-checked without that reboot boundary.

ChatGPT-Web parent → Goose-native → ChatGPT-Web child execution under Electron is also not yet live-proven. See [`chatgpt-web-subagents.md`](chatgpt-web-subagents.md) for the exact evidence boundary and qualification ladder.

No document may silently upgrade either item to proven status.

## Deferred

For Goose Control, asynchronous `submit_task → job_id → get_job`, cancellation, multi-target registries, approved fresh-session creation, and a persistent Orchestrator/Palmate layer are later phases. They are not requirements for the first synchronous continuation proof.

For ChatGPT-Web subagents, parent + three children is optional rare-capacity qualification after parent + two is clean. The BrowserHost five-tab safety ceiling is not a target operating envelope.

## Historical/design inputs

- Draft PR #25 refined Goose Control around native ACP and remains useful design evidence, but its write-capable custom-MCP-first Planner surface and async-first MVP are superseded by the current `goose-control-plan.md`.
- Draft PR #26 proposed a useful documentation split and lifecycle clarification, but its pre-autostart provisional runtime status is superseded by current `main` plus this reconciliation.
- The previous long chronological roadmap remains available in Git history at `dd44b74`; use it for archaeology only, not for current priorities or lifecycle instructions.

When historical material conflicts with current code/proofs and the current documents above, use the current documents.
