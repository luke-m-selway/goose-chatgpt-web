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

## Active qualification workstream

- [`chatgpt-web-subagents.md`](chatgpt-web-subagents.md) — durable qualification record for Goose-native ChatGPT-Web children and Electron BrowserHost concurrency.

Current evidence boundary:

- recursive ChatGPT-Web parent → Goose-native → ChatGPT-Web child execution: **PROVEN**;
- distinct parent/child Electron surfaces and real overlap: **PROVEN**;
- Goose native async background-task + later `load()` semantics: **PROVEN**;
- three distinct simultaneous ChatGPT-Web turns: **PROVEN structurally/live for ~24 s**;
- reliable parent + two operating envelope: **NOT YET QUALIFIED**;
- current Electron-native liveness hardening candidate: static/unit validation passed, successful three-surface live qualification pending;
- concurrent tool use across both children: **NOT YET PROVEN**.

The latest attempted natural parent + two proof was invalid because the model-generated first delegate call omitted invocation-level `async: true`; it still supplied useful two-turn slow→recovered liveness evidence and a later same-session follow-up remained coherent after the delegation/network-error episode.

Do not regress proven recursion back to “unproven,” and do not promote the parent + two envelope until the documented deterministic liveness and natural async integration proofs both pass.

## Active product milestone

- [`goose-control-plan.md`](goose-control-plan.md) — Goose Control remains the next product capability. Its backend is settled on authenticated loopback Goose ACP; its first Planner-facing proof is a private GPT Action calling a narrow authenticated HTTPS REST/OpenAPI facade.
- [`roadmap.md`](roadmap.md) — current and next work only, including the focused ChatGPT-Web concurrency/liveness qualification.

## Provisional / not yet proven

The actual Mac **reboot/login → automatic reconstruction → ordinary Goose first turn → separate dependent `--resume`** proof has not been run. Ordered autostart is implemented and live-checked without that reboot boundary.

The normal ChatGPT-Web parent + two ChatGPT-Web children operating envelope also remains provisional. See [`chatgpt-web-subagents.md`](chatgpt-web-subagents.md) for the exact live evidence, liveness false-terminal incident, current hardening design, async-invocation constraint, and next proof sequence.

No document may silently upgrade either item to proven status.

## Deferred

For Goose Control, asynchronous `submit_task → job_id → get_job`, cancellation, multi-target registries, approved fresh-session creation, and a persistent Orchestrator/Palmate layer are later phases. They are not requirements for the first synchronous continuation proof.

For ChatGPT-Web subagents, parent + three children is optional rare-capacity qualification after parent + two is clean. The BrowserHost five-tab safety ceiling is not a target operating envelope.

## Historical/design inputs

- Draft PR #25 refined Goose Control around native ACP and remains useful design evidence, but its write-capable custom-MCP-first Planner surface and async-first MVP are superseded by the current `goose-control-plan.md`.
- Draft PR #26 proposed a useful documentation split and lifecycle clarification, but its pre-autostart provisional runtime status is superseded by later runtime work.
- Older chronological roadmap material remains available in Git history for archaeology only, not for current priorities or lifecycle instructions.

When historical material conflicts with current code/proofs and the current documents above, use the current documents.