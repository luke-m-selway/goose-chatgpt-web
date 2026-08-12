# Contributing

Keep the project narrow: ChatGPT Web is a model/provider inside ordinary Goose. Goose remains the outer harness and owns sessions, tools/approvals, delegation, recipes/extensions, project execution, and context lifecycle.

Do not add a second orchestration framework or silently move Goose-owned responsibilities into the browser bridge.

## Core invariants

- Model selection is explicit; never silently fall back to another model or reasoning level.
- Full mode exposes local actions only through the active Goose tool contract and the `Goose Native` connector path.
- Goose remains the executor/approval authority for local tools.
- Electron BrowserHost owns browser state/surfaces only; it must not adopt the standalone Responses daemon or tunnel.
- Browser-only mode never creates a local-tool capability.
- Browser authentication state, runtime/tunnel credentials, Goose history, and private absolute user paths never enter the repository.
- UI drift and runtime-readiness failures fail closed rather than selecting another provider/transport or claiming success.

## Documentation and naming

Read [`docs/README.md`](docs/README.md), [`docs/architecture.md`](docs/architecture.md), [`docs/runtime-lifecycle.md`](docs/runtime-lifecycle.md), and [`docs/naming.md`](docs/naming.md) before lifecycle or architecture work.

Current documentation uses Goose terminology. Do not create new project/service/action names containing `codex`. That word is reserved for the actual Codex agent/ACP specialist when deliberately used as an external development worker.

If touching an inherited legacy identifier, either migrate it safely according to `docs/naming.md` or leave the existing compatibility boundary intact and document why. Do not create a second ambiguous alias.

## Runtime changes

Before changing service or BrowserHost lifecycle behavior:

1. establish which component owns the process;
2. prove the exact process is idle when required;
3. use the canonical component-specific start/stop path;
4. verify actual readiness, not just PID/listener existence;
5. do not restart the Goose host carrying your own session.

Do not infer semantics from generic `launcher` filenames.

## Before opening a pull request

1. Run `bun install --frozen-lockfile`, install locked launcher dependencies, and run `bun run verify`.
2. Add focused regression coverage for protocol, compaction, MCP, browser parsing/lifecycle, installer, or supervision changes.
3. Do not commit cookies, browser state, tunnel IDs/keys, local absolute paths, generated descriptors, or logs.
4. Preserve fail-closed behavior.
5. For browser UI changes, record the exact observed DOM/lifecycle evidence and add a reproducible fixture/test where practical.
6. Keep claims factual; this project is browser automation and is not a usage-limit bypass.

Native packaging work must preserve the supported platform matrix of the current branch. Do not broaden packaging or supervisor ownership as a side effect of an unrelated browser fix.
