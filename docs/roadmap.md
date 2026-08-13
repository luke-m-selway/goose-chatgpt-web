# goose-chatgpt-web roadmap

This file contains **current and next work only**. Older chronological engineering diary material remains historical, not a source of current lifecycle or priority instructions.

## Current runtime checkpoint — qualified base

Status: **current/proven**, with separately named validation gaps.

- Electron BrowserHost ownership is BrowserHost-only.
- Responses daemon and Secure MCP Tunnel are independently supervised.
- Canonical lifecycle is proven: `tunnel ready → BrowserHost genuinely ready → daemon ready`, with reverse shutdown.
- BrowserHost readiness is proven through the descriptor-provided Node/Electron Node browser-helper path; Bun-direct Playwright/CDP is not authoritative.
- Ordinary Goose first turn and persisted-session continuation are proven.
- Ordered macOS autostart is implemented and live-checked short of the actual reboot/login boundary.

Remaining lifecycle validation: **actual Mac reboot/login reconstruction is NOT RUN**.

## Active focused qualification — ChatGPT-Web subagents and three-surface liveness

Status: **recursive child execution proven; parent + two reliable envelope still active qualification**.

What is already proven:

1. ordinary ChatGPT-Web parent → Goose-native delegate → ChatGPT-Web child under Electron;
2. distinct parent/child BrowserHost surfaces;
3. genuine parent/child overlap;
4. native `delegate(..., async: true)` background-session semantics and later `load()` retrieval;
5. three distinct simultaneous ChatGPT-Web turns can exist: a controlled parent + two-child run achieved about 24 seconds of common overlap.

The three-way run exposed a real liveness defect in the then-current detector: Parent and Child A were terminated as `chatgpt_browser_control_unresponsive` even though their failure diagnostics still executed DOM work, BrowserHost heartbeats continued, and Child B experienced similar control slowness then recovered and completed. This was a false terminal, not proof that three BrowserHost surfaces cannot coexist.

A narrow Electron-native liveness hardening candidate now treats native `gone`/`destroyed` as deterministic terminal evidence, `unresponsive` as degraded/recoverable, `responsive` as recovery, completed CDP/DOM activity as positive health, and a prolonged indeterminate state as the bounded last resort. Static/unit validation passed; the successful three-surface live proof remains pending.

The latest natural parent + two attempt did **not** test the target topology because the first model-generated delegate call omitted invocation-level `async: true`, which defaults false. Only parent + Child A existed. Useful evidence from that invalid run:

- both parent and child experienced >5 s slow control probes and then recovered;
- BrowserHost heartbeats remained healthy;
- no native gone/destroyed/unresponsive event occurred;
- parent and child had different renderer PIDs in that run;
- the synchronous child path later hit a separate stream-decode network error;
- a follow-up turn in the same Goose conversation remained coherent and correctly diagnosed the missing async field.

Next actions:

1. commit/version the liveness implementation and reusable qualification infrastructure;
2. run a deterministic three-surface BrowserHost/liveness proof that does not depend on a parent model remembering `async: true`;
3. separately run the natural recursive parent + two integration proof using named child recipes plus explicit invocation-level `async: true` on both delegate calls;
4. qualify concurrent Goose Native tool use across both children;
5. only after parent + two is clean, optionally qualify parent + three as rare capacity.

Do not optimize for the BrowserHost five-tab safety ceiling and do not claim a higher concurrency level than was live-proven.

See [`chatgpt-web-subagents.md`](chatgpt-web-subagents.md) for exact traces/surfaces, failure classification, async semantics, liveness evidence, and promotion rules.

## Active product milestone — Goose Control first proof

Status: **active; separate from BrowserHost/subagent qualification**.

Build the smallest end-to-end Planner-to-Goose bridge described in [`goose-control-plan.md`](goose-control-plan.md):

```text
ChatGPT Planner
  → private custom GPT
  → GPT Action
  → authenticated HTTPS REST/OpenAPI facade
  → authenticated loopback Goose ACP
  → one hard-approved persisted Goose session
```

First-proof requirements:

- continuation only;
- short synchronous bounded `submit_turn`;
- mandatory idempotent `request_id`;
- final user-visible Goose result only;
- no arbitrary cwd/provider/model;
- no new sessions;
- no multi-target registry;
- no cancellation;
- no Orchestrator/Palmate;
- no Electron/lifecycle/autostart changes.

The ACP backend and persisted-session contract are settled. Do not spend this milestone rediscovering browser identity, inventing a second Goose session API, or treating Orchestrator as the transport.

## Next Goose Control phases — deferred until the first proof

1. If measured GPT Action behavior requires it, or after the synchronous bridge is proven, introduce `submit_task → job_id → get_job` around native ACP `session/prompt`.
2. Add cancellation through native ACP cancellation when needed.
3. Add a deterministic server-controlled target registry after one-target behavior is stable.
4. Add approved fresh-session profiles through ACP `session/new` only if real workflows require them.
5. Dogfood direct Planner → Goose Control before inserting a persistent Orchestrator/Palmate workflow layer.

## Separate remaining runtime validation

At an appropriate operator-controlled boundary, perform the actual macOS reboot/login reconstruction proof:

```text
reboot/login
  → ordered autostart reconstructs runtime
  → canonical lifecycle healthy
  → ordinary Goose first turn
  → separate dependent continuation
```

Do not perform this from a Goose turn that depends on the runtime being restarted.