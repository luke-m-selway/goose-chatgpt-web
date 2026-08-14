# Naming contract and deferred runtime-identifier migration

Status: **current conceptual terminology; mechanical runtime/ABI renaming is deferred.**

This document separates two things that must not be confused:

1. the names current documentation and agents should use **now** to describe the architecture accurately; and
2. a later mechanical migration of inherited `codex*` implementation, persisted-state, service, and public action identifiers.

The conceptual terminology below is current. The mechanical migration plan is intentionally not current runtime behavior and must not be applied piecemeal during unrelated reliability or feature work.

## Current conceptual terminology

Use these names in current documentation, prompts, reviews, and new architecture descriptions:

| Term | Meaning |
| --- | --- |
| **Goose** | Outer agent harness. Owns logical sessions/conversation state, tools and approvals, delegation/subagents, recipes/extensions, project execution, and context lifecycle. |
| **ChatGPT-Web provider** | Goose custom provider that routes selected model turns through this project's local Responses-compatible bridge. |
| **Responses daemon** | Independently supervised loopback service that translates provider requests into ChatGPT-Web browser turns and carries the bounded replay/capability state required by that provider turn. |
| **Electron BrowserHost** | Independently owned browser process that holds the authenticated ChatGPT partition and task-bound browser surfaces plus BrowserHost control/CDP endpoints. It does not own Goose, the daemon, or the tunnel. |
| **browser helper** | Daemon-side Node/Electron-Node client that attaches to the exact leased BrowserHost surface and performs browser automation. |
| **Secure MCP Tunnel** | Independently supervised outbound connector/tool runtime used by the full-mode tool path. |
| **Goose Native** | Current ChatGPT connector identity for the active Goose turn's tool/delegation contract. |
| **Goose Control** | Planner-facing control capability for ordinary Goose sessions. It is a Day Shift concern and is not a BrowserHost component. |
| **Codex / Codex ACP specialist** | The actual Codex agent when deliberately selected as a specialist or recovery worker. |

`launcher` is not an ownership term. Where an inherited filename still contains `launcher`, describe its actual role explicitly instead of deriving architecture from the filename.

## Current naming rule

New conceptual documentation and new public-facing architecture names should be Goose-first.

Do **not** create a new `codex*` name merely because inherited implementation still contains one. Use `Codex` normally only for the actual Codex agent/specialist or when naming a literal legacy identifier that is being migrated or discussed historically.

Legacy implementation names may remain temporarily when changing them would affect persisted state, process supervision, connector schemas, compatibility, packaging, or operator recovery. Leaving such an identifier in place temporarily is preferable to an unsafe partial rename.

## Deferred mechanical naming migration

A later dedicated maintenance milestone should inventory and migrate the remaining inherited identifiers as one reviewed compatibility change. This is **not** authorized by this documentation cleanup.

The known migration families include at least:

```text
CODEX_CHATGPT_WEB_*
io.github.codex-chatgpt-web.*
codex_tool_call and related public MCP/action names
scripts/start-goose-launcher.ts
package/bin/application names
runtime/application-support directories
persisted service/config identifiers
```

Likely Goose-era replacements should follow the current terminology, but exact spellings are not considered settled merely because an example seems obvious. For example, `GOOSE_CHATGPT_WEB_*` is the natural direction for inherited environment variables, while exact service labels, public MCP action names, executable names, and compatibility aliases require an inventory before selection.

### Migration workstreams

#### 1. Environment variables and runtime home

Inventory all `CODEX_CHATGPT_WEB_*` consumers before changing any variable. Determine which values are ephemeral implementation details and which are referenced by installed launchd definitions, scripts, runtime-home configuration, tests, or external operator instructions.

If a compatibility alias is required, it must be explicitly deprecated and bounded. Current documentation should still advertise only the Goose-era name once the migration lands.

#### 2. launchd/service identifiers

Inventory every `io.github.codex-chatgpt-web.*` label plus any references from install, uninstall, lifecycle, autostart, doctor/status, and recovery paths.

Migrate transactionally so an upgrade cannot leave two supervisors or two differently named services active. Preserve the proven ownership model and canonical startup/shutdown ordering during the rename.

#### 3. Public MCP/action ABI

Inventory public actions with inherited names such as `codex_tool_call`, `codex_exec`, and related connector-visible schema identifiers.

This is higher risk than an internal symbol rename because ChatGPT can cache connector schema/permission state by connector identity. Do not silently alias or rename a public action in a way that leaves the browser using a stale cached contract. The migration must explicitly decide whether the safe path is a refreshed/new connector contract, a temporary compatibility surface, or another fail-closed transition.

`Goose Native` turn-token authority and Goose's role as final tool executor must remain unchanged by the naming migration.

#### 4. BrowserHost entry points

Rename ambiguous inherited entry points such as `scripts/start-goose-launcher.ts` only after every lifecycle/autostart/test reference is inventoried.

The replacement should describe what the command actually owns, for example a BrowserHost-specific name. It must not imply that Electron launches or supervises Goose, the Responses daemon, or the Secure MCP Tunnel.

#### 5. Package, executable, application, and persisted directories

Inventory package metadata, executable/bin names, application titles, runtime directories, application-support directories, installer/uninstaller state, generated definitions, and upgrade paths that still use inherited project naming.

A directory rename must preserve authentication/runtime state safely or deliberately migrate it; never strand a valid browser login or create two competing runtime homes merely to make names prettier.

## Preconditions for implementing the migration

Before code/config changes begin, the implementation task must:

1. start from a clean, reconciled current `main`;
2. inventory every consumer of each identifier family before renaming it;
3. classify each identifier as internal, persisted, service-level, public ABI, or user-facing;
4. define old → new mappings and any temporary compatibility aliases;
5. define rollback/removal behavior for installed state;
6. preserve the current lifecycle ownership model and canonical startup/shutdown sequence;
7. preserve `Goose Native` security/turn authority semantics;
8. prove upgrade/migration against the real development runtime rather than only fresh-install tests;
9. update this document from "deferred" to the exact landed identifiers and evidence.

## Acceptance criteria for the future migration

The naming migration is complete only when:

- current docs contain no unexplained inherited `codex*` operator/runtime name;
- new installs use only the selected Goose-era runtime/service/environment names;
- an existing development installation migrates without losing browser authentication or creating duplicate supervisors/runtime homes;
- canonical lifecycle and ordered macOS autostart still work after migration;
- public connector/action schema changes are deliberately refreshed and live-proven rather than assumed;
- old aliases/state are either safely removed or explicitly documented as bounded compatibility debt;
- Codex remains available as an actual ACP specialist without its name being used for unrelated Goose-owned infrastructure.

## Non-goals of the naming migration

The future rename must not become an excuse to:

- redesign the Electron BrowserHost;
- move daemon/tunnel ownership into Electron;
- change Goose session ownership;
- rewrite delegation/subagent architecture;
- redesign Goose Control;
- add another supervisor/router/session database;
- bundle unrelated reliability work into a cosmetic rename.

The desired outcome is a mechanical, evidence-backed compatibility migration that makes implementation names match the already-settled Goose-first architecture.
