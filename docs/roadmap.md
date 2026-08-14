# goose-chatgpt-web roadmap

This file contains **current and next work only**. The older chronological engineering diary remains in Git history at `dd44b74` and is historical, not a source of current lifecycle or priority instructions.

## Current runtime checkpoint — qualified

Status: **current/proven**, with one named validation gap.

- Electron BrowserHost ownership is BrowserHost-only.
- Responses daemon and Secure MCP Tunnel are independently supervised.
- Canonical lifecycle is proven: `tunnel ready → BrowserHost genuinely ready → daemon ready`, with reverse shutdown.
- BrowserHost readiness is proven through the descriptor-provided Node/Electron Node browser-helper path; Bun-direct Playwright/CDP is not authoritative.
- Ordinary Goose first turn and separate persisted-session `--resume` continuation are proven.
- Ordered macOS autostart is implemented with one login-visible coordinator that invokes canonical `lifecycle start`; daemon/tunnel launchd definitions live under the runtime home and remain launchd-supervised.
- The earlier failed in-task lifecycle/autostart proof was self-interference from the active BrowserHost-backed turn, not a general Electron regression.

Remaining validation: **actual Mac reboot/login reconstruction is NOT RUN.** This remains an explicit lifecycle validation item.

Draft PR #31's development runtime is deployed at
`f54ba39305a6e6a101aa599db1409ab46b9666a1` with passive flight recording enabled. Its native
liveness design/review has passed, and natural usage has established a genuine parent plus two async
ChatGPT-Web child topology with genuine three-surface overlap. Reliable parent-plus-two-child
completion is still **NOT QUALIFIED**. The current reliability phase is ecological observation of
ordinary single-agent and naturally delegated use, not another designated synthetic run.

## Next feature milestone — Goose Control first proof

Status: **next after the passive reliability closeout; not implemented yet**.

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
  → separate dependent --resume
```

Do not perform this from a Goose turn that depends on the runtime being restarted.

## Active passive Electron-native liveness observation

The current feature candidate and its retained qualification procedures are documented in
[`chatgpt-web-concurrency-qualification.md`](chatgpt-web-concurrency-qualification.md). Native
liveness design/review, genuine natural parent-plus-two-async-child topology, and genuine
three-surface overlap are established. Multiple runs nevertheless exposed acknowledgement,
Responses-transport, transient ChatGPT UI, and broker-continuation failure classes, so reliable
completion remains **NOT QUALIFIED**.

The deterministic qualification runner remains available as reusable tooling. It is not the current
next action. The deployed passive recorder described in
[`chatgpt-web-flight-recorder.md`](chatgpt-web-flight-recorder.md) now accumulates correlated evidence
from ordinary use without an observer or designated workload.
