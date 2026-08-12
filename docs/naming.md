# Naming contract and legacy-name retirement

Status: **current terminology specification; runtime rename migration still pending.**

The fork inherited names from a different outer harness. Those names now obscure ownership and have repeatedly made runtime operations easier to misread. This document defines the names that new code, documentation, prompts, logs, and operator instructions should use.

## Normative component names

| Term | Meaning |
| --- | --- |
| **Goose** | The outer agent harness. Goose owns logical conversation/session state, tools and approvals, delegation/subagents, recipes/extensions, project execution, and compaction/context lifecycle. |
| **ChatGPT-Web provider** | Goose custom provider that routes selected model turns to the local Responses daemon. |
| **Responses daemon** | The standalone loopback service that translates Goose Responses traffic into ChatGPT-Web browser turns and native tool-result rounds. |
| **Electron BrowserHost** | The project-owned Electron process that owns the authenticated ChatGPT partition, task-bound browser surfaces, control endpoint, and CDP endpoint. It does not own Goose, the Responses daemon, or the tunnel. |
| **browser helper** | The daemon-spawned client process that attaches to a leased BrowserHost surface and runs the browser worker. |
| **Secure MCP Tunnel** | Independently supervised outbound tunnel/tool runtime used in full mode. |
| **Goose Native** | ChatGPT connector identity that exposes the active Goose tool contract. |
| **Codex agent / Codex ACP specialist** | The actual external Codex agent when deliberately used as a development specialist. This is the only normal current use of the word `Codex`. |

## Words that must not carry architecture

`launcher` is too ambiguous to identify ownership by itself. Use a qualified name:

- **Electron BrowserHost** for the persistent browser-owning Electron process;
- **BrowserHost start command** for the command that starts only that process;
- **desktop UI** only when referring to the Electron configuration/window UI;
- **runtime supervisor** only for a component that actually supervises another process.

A script named `start-goose-launcher` does **not** start Goose. In the current source tree it starts the standalone Electron BrowserHost in bootstrap-only mode and blocks in the foreground. That filename is legacy and should not survive the naming migration.

## Target runtime rename

The naming cleanup should be a mechanical migration after the active Electron reliability work is checkpointed. Do not mix it into browser-behaviour debugging.

| Legacy identifier | Target identifier |
| --- | --- |
| package/project name `codex-chatgpt-web` | `goose-chatgpt-web` |
| executable/bin `codex-chatgpt-web` | `goose-chatgpt-web` |
| `CODEX_CHATGPT_WEB_HOME` | `GOOSE_CHATGPT_WEB_HOME` |
| default application/runtime directories using the old project name | Goose-named equivalents |
| launchd labels using `io.github.codex-chatgpt-web.*` | `io.github.goose-chatgpt-web.*` |
| application title `Codex Web GPT` | `Goose ChatGPT Web` |
| package script `launcher:goose` | `browser-host` or equally explicit BrowserHost-only name |
| `scripts/start-goose-launcher.ts` | `scripts/start-browser-host.ts` |
| connector action names such as `codex_tool_inventory`, `codex_tool_call`, and `codex_exec` | Goose-named equivalents (`goose_tool_inventory`, `goose_tool_call`, `goose_exec`) |
| legacy connector identity that predates `Goose Native` | historical only; never selected for current runtime |

The exact public connector-action migration must preserve fail-closed behavior: create/refresh the Goose-named connector contract deliberately rather than silently aliasing an old cached ChatGPT connector schema.

## Compatibility and migration rule

Where a legacy identifier is part of persisted local state, launchd configuration, tunnel profile state, connector ABI, or user configuration, rename it transactionally:

1. detect the legacy state explicitly;
2. prove the current runtime is idle;
3. install the Goose-named replacement;
4. verify health/readiness and the active connector contract;
5. remove the legacy state only after the replacement works;
6. never keep two ambiguous supervisors active at once.

Temporary compatibility aliases are acceptable only when they are necessary for a safe migration and clearly marked deprecated. They must not remain the documented operator path.

## Documentation rule

Current documentation must use Goose terminology even if an implementation symbol has not yet been renamed. When the legacy implementation spelling matters, write it once as a code literal and immediately describe its real role.

Historical documents may preserve old names only when clearly segregated under `docs/history/` or in repository/PR history. They are not current instructions.
