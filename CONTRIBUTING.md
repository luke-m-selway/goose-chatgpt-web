# Contributing

Keep the project narrow: ChatGPT Web is a model/provider inside ordinary Goose. Goose remains the outer harness and owns sessions, tools/approvals, delegation, recipes/extensions, project execution, and context lifecycle.

## Core invariants

- Model selection is explicit; never silently fall back to another model or reasoning level.
- Full mode exposes local actions only through the active Goose tool contract and the `Goose Native` connector path.
- Goose remains the executor/approval authority for local tools.
- Electron BrowserHost owns browser state/surfaces only; it must not adopt the standalone Responses daemon or Secure MCP Tunnel.
- The daemon and tunnel remain independently supervised.
- Browser-only mode never creates a local-tool capability.
- Browser authentication state, runtime/tunnel credentials, Goose history, and private absolute user paths never enter the repository.
- UI drift and runtime-readiness failures fail closed rather than selecting another provider/transport or claiming success.

## Architecture, lifecycle, and naming changes

Read `docs/README.md`, `docs/architecture.md`, `docs/runtime-lifecycle.md`, and `docs/naming.md` first.

Before changing lifecycle behavior:

1. establish which component owns the process;
2. preserve the canonical dependency order unless a focused qualification deliberately changes it;
3. verify BrowserHost readiness with the descriptor-provided Node/Electron Node helper path, not Bun-direct Playwright/CDP;
4. do not run a disruptive lifecycle proof from the Goose/BrowserHost turn whose runtime is being disrupted;
5. never restart the Goose host carrying your own session.

For naming work, distinguish conceptual terminology from implementation migration. New documentation should use the Goose-first names in `docs/naming.md`, but existing persisted/service/public-ABI `codex*` identifiers must be changed only in a dedicated compatibility migration. Do not bundle environment-variable, launchd-label, connector-action, script, package/bin, or runtime-directory renames into unrelated feature work.

## Cross-project Goose Control boundary

Goose Control is provider-agnostic Goose workflow/control infrastructure and active ownership/planning belongs in Day Shift. Historical material in `docs/goose-control-plan.md` may inform security/ACP decisions but must not couple Goose Control to Electron/BrowserHost identity or Goose Native turn tokens.

## Before opening a pull request

1. Run the focused tests for the changed area and the repository verification suite appropriate to the change.
2. Add focused regression coverage for protocol, compaction, MCP, browser parsing/lifecycle, installer, or supervision changes.
3. Do not commit cookies, browser state, tunnel IDs/keys, local absolute paths, generated descriptors, or logs.
4. Preserve fail-closed behavior.
5. For browser UI changes, record exact observed evidence and add a reproducible fixture/test where practical.
6. Keep claims factual; this project is browser automation and is not a usage-limit bypass.
7. If changing a persisted/runtime/public identifier, document the old→new migration, upgrade behavior, rollback/removal behavior, and live compatibility proof.
