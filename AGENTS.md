# Agent safety and runtime rules

These instructions apply to coding/automation agents working in this repository.

For explicit code-maintainability review, or before creating or modifying source code, scripts, or behavioral/executable configuration, read and apply `.agents/skills/code-maintainability/SKILL.md`.

For documentation work, and before completing a technical change that may alter documented state, read and apply `.agents/skills/lean-documentation/SKILL.md`.

## Read current documentation first

Before architecture, lifecycle, BrowserHost, tunnel, or Goose Control work, read:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/runtime-lifecycle.md`
4. `docs/roadmap.md`
5. `docs/goose-control-plan.md` when the task concerns Goose Control
6. `docs/chatgpt-web-subagents.md` when the task concerns ChatGPT-Web subagents or BrowserHost concurrency qualification

Current documentation outranks historical roadmap material and draft PR designs.

## Check upstream before new diagnosis

Before diagnosing a new ChatGPT-Web UI, browser, authentication, lifecycle, or compatibility problem from scratch, check current upstream `miuuyy/codex-chatgpt-web` first, including recent commits, issues, and pull requests: https://github.com/miuuyy/codex-chatgpt-web

Reuse or adapt an upstream fix when it fits. Do not blindly replace Goose-specific architecture or unrelated live state; investigate locally only where upstream does not already explain the symptom or where this fork intentionally differs.

## Host/session safety

- Preserve ignored `.env` files, browser authentication state, runtime keys, credentials, and unrelated local proof artifacts unless the task explicitly authorizes changing them.
- Never print, log, commit, or otherwise expose credentials or authentication material.
- Do not enumerate macOS Keychain contents or use broad discovery commands such as `security dump-keychain`.
- If a task genuinely requires a Keychain item, access only the exact known service/account entry needed for that task.
- A Goose main agent must never restart, quit, upgrade, relaunch, terminate, or otherwise replace the Goose host carrying its own session.
- Do not use broad process-kill commands for Chrome, Electron, Playwright, the Responses daemon, or the tunnel. Target only a known project-owned process when an explicit test requires it.

## Current ownership and lifecycle

- Goose owns logical session state, tools/approvals, delegation/subagents, recipes/extensions, project execution, and context lifecycle.
- The Responses daemon and Secure MCP Tunnel are independently supervised.
- Electron owns BrowserHost only: authenticated browser state, task-bound surfaces, BrowserHost control, and CDP.
- Do not restore daemon/tunnel ownership to Electron `RuntimeSupervisor` in standalone Goose mode.

Canonical lifecycle:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

Use the canonical lifecycle entry point rather than reconstructing startup from lower-level service scripts.

## Proof boundaries that must not be rediscovered

- BrowserHost readiness uses the descriptor-provided browser helper with Node/Electron Node semantics and `ELECTRON_RUN_AS_NODE=1`. Bun-direct Playwright/CDP is not authoritative readiness evidence.
- A lifecycle/autostart proof launched from an active BrowserHost-backed turn can interfere with the runtime carrying that same turn. Do not generalize such self-interference into an Electron regression.
- Ordinary Goose continuation is already proven. Fresh ChatGPT Temporary Chats across Goose user turns are expected; Goose, not browser chat reuse, owns durable continuation.
- Same-Goose-session continuation has also survived a preceding delegation/network-error episode and produced a coherent follow-up. Do not infer that any tool/delegation error necessarily poisons later continuation.
- Ordered macOS autostart is implemented and live-checked short of an actual reboot/login. Reboot/login reconstruction remains **NOT RUN** until explicitly performed.
- Natural ChatGPT-Web parent → Goose-native → ChatGPT-Web child execution under Electron is **PROVEN**. Distinct parent/child surfaces and real overlap are **PROVEN**. Do not spend work re-proving the basic one-child capability unless new contradictory evidence appears.
- Goose native async delegation is invocation-level: `delegate(..., async: true)`. If `async` is omitted it defaults false. Prose inside child `instructions` does not force background execution. Named recipes can stabilize child provider/model/workload, but the parent tool call must still carry `async: true` unless Goose's schema changes.
- A prior parent + two run achieved about 24 seconds of genuine three-way overlap. Its failure was a false `chatgpt_browser_control_unresponsive` terminal on two still-live turns, not proof that the BrowserHost cannot host three surfaces.
- Slow CDP/DOM operations are congestion evidence, not by themselves renderer-death evidence. Preserve deterministic/native lifecycle distinctions (`gone`/`destroyed` terminal; `unresponsive` degraded/recoverable; `responsive` recovery) when working on the active liveness hardening.
- The BrowserHost five-tab limit is a safety ceiling, not a target operating envelope. The intended normal qualification target is parent + two children.
- Qualification results must name the exact committed revision and helper bundle under test. Prefer committed first-party runner/analyzer infrastructure over ad-hoc monitor-agent shell reconstruction.

## Goose Control boundary

- Goose Control addresses persisted Goose sessions through authenticated loopback `goose serve` ACP.
- It must not address Electron windows, CDP targets, ChatGPT browser sessions, or BrowserHost process identity.
- It is separate from Goose Native's per-turn `turn_token` capability.
- Do not invent a second Goose session/execution API; use native ACP session operations.
- The first implementation proof is the narrow synchronous GPT Action → REST/OpenAPI → ACP continuation path documented in `docs/goose-control-plan.md`; async jobs, cancellation, multi-target routing, fresh sessions, and Orchestrator are later work.

## Delegation

- Recursive one-child ChatGPT-Web delegation is qualified, but parallel ChatGPT-Web child fan-out is not yet a supported operating envelope. Do not claim parent + two as reliable until the proofs in `docs/chatgpt-web-subagents.md` pass on the current liveness implementation.
- For natural parent + two tests, use named child recipes to minimize model-generated arguments and require explicit `async: true` on both delegate invocations.
- If a model omits `async: true`, classify the run as an invalid async sequence rather than a BrowserHost concurrency failure.
- When delegating to a non-ChatGPT/free worker, name the intended provider/model explicitly so it does not inherit ChatGPT-Web transport by accident.