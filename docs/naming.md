# Naming contract and legacy-name retirement

Status: **current terminology specification; exact runtime identifier migration still pending and partly provisional.**

The fork inherited names from a different outer harness. Those names now obscure ownership and have repeatedly made runtime operations easier to misread. This document defines the **normative conceptual names** that new code, documentation, prompts, logs, and operator instructions should use now, and separately records candidate implementation identifiers for the later mechanical migration.

## Normative component names

These conceptual names are settled unless the architecture itself changes:

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

## Proposed runtime-identifier migration

The naming cleanup should be a mechanical migration after the active Electron reliability work is checkpointed. Do not mix it into browser-behaviour debugging.

The **direction** of each rename is settled: inherited `codex*` project/harness naming must disappear from current Goose runtime identifiers. The exact spelling of some new persisted/ABI identifiers remains subject to implementation review so that compatibility state can be migrated safely.

| Legacy identifier | Proposed Goose-era replacement | Decision status |
| --- | --- | --- |
| package/project name `codex-chatgpt-web` | `goose-chatgpt-web` | intended final project name |
| executable/bin `codex-chatgpt-web` | `goose-chatgpt-web` | intended; verify installer/upgrade compatibility |
| `CODEX_CHATGPT_WEB_HOME` | `GOOSE_CHATGPT_WEB_HOME` | proposed exact env name; verify all persisted config/service consumers before landing |
| default application/runtime directories using the old project name | Goose-named equivalents | required direction; exact migration paths must be inventoried first |
| launchd labels using `io.github.codex-chatgpt-web.*` | Goose-named service labels | required direction; exact labels must be coordinated with uninstall/upgrade migration |
| application title `Codex Web GPT` | `Goose ChatGPT Web` | intended user-facing name; recheck packaged-app migration implications |
| package script `launcher:goose` | explicit BrowserHost-only command | exact CLI/script spelling still open |
| `scripts/start-goose-launcher.ts` | explicit BrowserHost filename, e.g. `scripts/start-browser-host.ts` | role is settled; exact final operator interface depends on supervisor design |
| connector action names such as `codex_tool_inventory`, `codex_tool_call`, and `codex_exec` | Goose-named action equivalents | rename required in principle; exact public ABI transition must be proven against ChatGPT connector caching |
| legacy connector identity that predates `Goose Native` | historical only; never selected for current runtime | settled |

Do not read an example proposed spelling in this table as proof that it already exists in the runtime.

The exact public connector-action migration must preserve fail-closed behavior: create/refresh the Goose-named connector contract deliberately rather than silently aliasing an old cached ChatGPT connector schema.

## Open naming decisions to resolve during implementation

The later naming PR must explicitly settle and document:

- the final BrowserHost CLI/service name (`browser-host`, `browser-host service`, or another concise ownership-accurate form);
- the exact BrowserHost supervisor/service label and packaged-app title;
- whether the home environment variable needs a temporary deprecated alias and for how long;
- the exact old→new application-support/runtime directory migration on macOS and any other supported platform;
- whether public MCP action names can be renamed in place or require a deliberately new connector contract because of ChatGPT schema caching;
- which inherited internal implementation symbols can remain private temporarily without appearing in current operator/API documentation.

Once live implementation settles one of these, replace the provisional language here with the exact resulting identifier and migration evidence.

## Compatibility and migration rule

Where a legacy identifier is part of persisted local state, launchd configuration, tunnel profile state, connector ABI, or user configuration, rename it transactionally:

1. inventory every consumer before changing the identifier;
2. detect the legacy state explicitly;
3. prove the current runtime is idle;
4. install the Goose-named replacement;
5. verify health/readiness and the active connector contract;
6. remove the legacy state only after the replacement works;
7. never keep two ambiguous supervisors active at once.

Temporary compatibility aliases are acceptable only when they are necessary for a safe migration and clearly marked deprecated. They must not remain the documented operator path.

## Documentation rule

Current documentation must use Goose terminology even if an implementation symbol has not yet been renamed. When the legacy implementation spelling matters, write it once as a code literal and immediately describe its real role.

Historical documents may preserve old names only when clearly segregated under `docs/history/` or in repository/PR history. They are not current instructions.

Do not use the word `Codex` for inherited product/package/runtime names merely because the current source still contains them. Reserve it for the actual Codex agent/ACP specialist or for an explicitly labeled legacy identifier in a migration/historical context.
