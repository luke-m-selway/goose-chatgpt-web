# goose-chatgpt-web

Use an authenticated ChatGPT Web session as a model/provider inside ordinary Goose while Goose remains the owner of the agent session and project execution.

## Current architecture

```text
Goose
  │ custom ChatGPT-Web Responses provider
  ▼
independently supervised Responses daemon (loopback)
  │ browser helper
  ▼
bootstrap-only Electron BrowserHost
  ▼
authenticated ChatGPT Temporary Chat

Full-mode tool path:
ChatGPT → Goose Native connector → Secure MCP Tunnel → active Goose tool contract
                                                    → Goose executes/approves
```

Ownership is deliberate:

| Component | Current responsibility |
| --- | --- |
| **Goose** | logical conversation/session state, tools and approvals, delegation/subagents, recipes/extensions, project execution, compaction/context lifecycle |
| **Responses daemon** | loopback Responses transport, bounded response replay state, capability broker, browser-helper lifecycle |
| **Electron BrowserHost** | authenticated ChatGPT partition, task-bound browser surfaces, BrowserHost control endpoint, CDP endpoint |
| **Secure MCP Tunnel** | independently supervised outbound connector/tool transport |
| **ChatGPT Web** | model inference for the selected provider turn |

Electron owns BrowserHost only. It does **not** own the Responses daemon or the tunnel. Do not restore standalone daemon/tunnel ownership to Electron `RuntimeSupervisor`.

## Qualified runtime checkpoint

Status as of 2026-08-12: **current/proven**, with one explicitly unrun autostart proof.

The known-good Electron checkpoint is `c624274` (`Checkpoint proven Electron lifecycle and Goose inference`). Current `main` then adds `dd44b74` (`Add ordered macOS autostart coordinator`).

Separately, draft PR #31's development runtime is deployed at
`f54ba39305a6e6a101aa599db1409ab46b9666a1`. Its native liveness design/review has passed, a genuine
parent plus two async ChatGPT-Web child topology and genuine three-surface overlap have been
observed, and passive flight recording is enabled for ordinary use. Reliable parent-plus-two-child
completion remains **NOT QUALIFIED**; the deployed development revision does not replace the proven
`c624274`/`dd44b74` lifecycle/autostart baseline.

The canonical lifecycle is:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

BrowserHost readiness is stronger than PID/descriptor/CDP existence. The authoritative readiness path leases one disposable BrowserHost surface and verifies it with the descriptor-provided browser helper running through Node/Electron Node semantics (`ELECTRON_RUN_AS_NODE=1`), then releases the lease. Bun-direct Playwright/CDP is not authoritative BrowserHost-health evidence.

Ordinary Goose continuation is proven with a persisted named Goose session followed by a separate later `--resume`. A fresh ChatGPT Temporary Chat for a later Goose turn is expected and does not mean the Goose session failed to continue.

The earlier failed in-task lifecycle/autostart proof was narrowed to **self-interference**: an active BrowserHost-backed turn was testing lifecycle behavior of the same runtime it depended on. It is not evidence of a general Electron regression.

## Ordered macOS autostart

Ordered autostart is implemented on current `main`:

- one login-visible project coordinator LaunchAgent;
- daemon/tunnel launchd definitions managed under the Goose runtime home rather than independently login-visible;
- coordinator invokes canonical `lifecycle start`;
- coordinator uses `KeepAlive=false`;
- launchd remains the daemon/tunnel supervisor after canonical startup;
- canonical lifecycle health, a fresh ordinary Goose turn, and a separate dependent `--resume` continuation have passed.

**NOT RUN:** an actual Mac reboot/login reconstruction proof. Do not describe reboot/login recovery as validated until that exact proof is performed.

Operator entry points remain the current legacy-named executable surface:

```bash
codex-chatgpt-web lifecycle <status|start|restart|stop>
codex-chatgpt-web autostart <status|install|trigger|disable>
```

Those literal names are inherited implementation identifiers; they do not change the Goose-first ownership model above.

## Passive reliability closeout and next feature milestone

The current reliability phase uses the in-process passive flight recorder to collect correlated
browser, Responses transport, broker, navigation, network-failure, and screenshot evidence during
ordinary single-agent and naturally delegated ChatGPT-Web work. Designated synthetic qualification
is paused in favor of that ecological evidence. See
[`docs/chatgpt-web-flight-recorder.md`](docs/chatgpt-web-flight-recorder.md) and
[`docs/chatgpt-web-concurrency-qualification.md`](docs/chatgpt-web-concurrency-qualification.md).

After this reliability closeout, Goose Control remains the next feature milestone. It is a
Planner-to-Goose management path and is separate from both Electron BrowserHost identity and Goose
Native's per-turn `turn_token` authority.

The settled backend is authenticated loopback `goose serve` ACP. The first practical Planner-facing proof is intentionally small:

```text
ChatGPT Planner
  → private custom GPT in the existing web conversation
  → GPT Action
  → narrow authenticated HTTPS REST/OpenAPI Goose Control facade
  → authenticated loopback Goose ACP
  → one hard-approved persisted Goose session
```

The first proof is continuation-only and synchronous/bounded: one idempotent `submit_turn` request with mandatory `request_id`, returning only the final user-visible Goose result. Async jobs, cancellation, multiple targets, fresh sessions, and Orchestrator/Palmate remain later phases.

See [`docs/goose-control-plan.md`](docs/goose-control-plan.md).

## Documentation

Start with [`docs/README.md`](docs/README.md). It classifies current, active, deferred, and historical material.

- [`docs/architecture.md`](docs/architecture.md) — current ownership and request/tool flow.
- [`docs/runtime-lifecycle.md`](docs/runtime-lifecycle.md) — canonical lifecycle, BrowserHost readiness, autostart status, and proof boundaries.
- [`docs/chatgpt-web-flight-recorder.md`](docs/chatgpt-web-flight-recorder.md) — active passive observation for ordinary ChatGPT-Web use.
- [`docs/chatgpt-web-concurrency-qualification.md`](docs/chatgpt-web-concurrency-qualification.md) — current liveness/concurrency evidence and qualification status.
- [`docs/goose-control-plan.md`](docs/goose-control-plan.md) — next active Goose Control milestone.
- [`docs/roadmap.md`](docs/roadmap.md) — current and next work only.
- [`docs/security-model.md`](docs/security-model.md) — trust and capability boundaries.
- [`AGENTS.md`](AGENTS.md) — mandatory rules for coding/automation agents.

## Development

This repository currently uses Bun for the TypeScript/runtime toolchain and Electron/Node semantics for the BrowserHost helper. Before merging runtime changes, use the repository's normal verification suite:

```bash
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd launcher
bun run verify
```

This project automates a user-authenticated ChatGPT web session; it is not a supported model API or a usage-limit bypass. Browser authentication state and tunnel/runtime credentials are sensitive local state. See [`SECURITY.md`](SECURITY.md) and [`docs/security-model.md`](docs/security-model.md).
