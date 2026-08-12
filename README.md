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

The known-good Electron checkpoint is `c624274` (`Checkpoint proven Electron lifecycle and Goose inference`), ordered macOS autostart was added at `dd44b74`, and the current reconciled documentation baseline is `40c29bf` (`Reconcile runtime and Goose Control documentation`).

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

Operator entry points still expose inherited implementation naming:

```bash
codex-chatgpt-web lifecycle <status|start|restart|stop>
codex-chatgpt-web autostart <status|install|trigger|disable>
```

Those literal names are compatibility debt, not the conceptual architecture. Their eventual migration, together with inherited environment variables, service labels, connector action names, BrowserHost scripts, package/bin names, and runtime directories, is deliberately planned in [`docs/naming.md`](docs/naming.md). Do not rename them piecemeal.

## Project boundary: Goose Control

Goose Control is **not** an Electron/ChatGPT-Web transport component. It is provider-agnostic Planner-to-Goose control infrastructure and active ownership/planning has moved to the separate Day Shift project.

This repository retains [`docs/goose-control-plan.md`](docs/goose-control-plan.md) only as historical/cross-project context and for reusable ACP/security lessons. It must not become a reason to couple Goose Control to BrowserHost/CDP identity or to Goose Native's per-turn `turn_token` authority.

`goose-chatgpt-web` should continue to own provider/browser-specific qualifications. For example, proving whether one ChatGPT-Web parent can safely run one or more ChatGPT-Web child provider turns under Electron belongs here when explicitly resumed; the later policy for when Day Shift should use such children belongs in Day Shift.

## Documentation

Start with [`docs/README.md`](docs/README.md). It classifies current, deferred, and historical material.

- [`docs/architecture.md`](docs/architecture.md) — current ownership and request/tool flow.
- [`docs/runtime-lifecycle.md`](docs/runtime-lifecycle.md) — canonical lifecycle, BrowserHost readiness, autostart status, and proof boundaries.
- [`docs/naming.md`](docs/naming.md) — current Goose-first terminology and deferred mechanical runtime/ABI rename plan.
- [`docs/roadmap.md`](docs/roadmap.md) — current provider/runtime work and explicit remaining validation.
- [`docs/security-model.md`](docs/security-model.md) — trust and capability boundaries.
- [`docs/history/README.md`](docs/history/README.md) — historical architecture/documentation index and immutable checkpoints.
- [`AGENTS.md`](AGENTS.md) — mandatory rules for coding/automation agents.

## Development

This repository currently uses Bun for the TypeScript/runtime toolchain and Electron/Node semantics for the BrowserHost helper. Before merging runtime changes, use the repository's normal verification suite:

```bash
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd launcher
bun run verify
```

This project automates a user-authenticated ChatGPT web session; it is not a supported model API or a usage-limit bypass. Browser authentication state and tunnel/runtime credentials are sensitive local state. See [`SECURITY.md`](SECURITY.md) and [`docs/security-model.md`](docs/security-model.md).
