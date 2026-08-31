# Historical documentation index

Status: **historical reference only; not an operating contract.**

The project moved through several materially different architectures: inherited Codex-oriented desktop/runtime assumptions, managed Chrome as the primary browser transport, and the current Goose-first standalone runtime with an Electron BrowserHost.

Old documents remain useful for archaeology, but they must not be allowed to outrank the current architecture/lifecycle docs simply because an old command or identifier is searchable.

## Current authority

Start with:

- [`../README.md`](../README.md)
- [`../architecture.md`](../architecture.md)
- [`../runtime-lifecycle.md`](../runtime-lifecycle.md)
- [`../security-model.md`](../security-model.md)
- [`../naming.md`](../naming.md)
- [`../roadmap.md`](../roadmap.md)
- [`../../AGENTS.md`](../../AGENTS.md)

## Useful immutable checkpoints

### Pre-reconciliation engineering diary

The long chronological roadmap and transition-period documentation immediately before the current docs reconciliation are preserved at:

`dd44b74f379fbf8f341488680401a3367c53ad4c`

Use that revision when investigating why a historical managed-Chrome, connector, lifecycle, or Electron decision was made. Do not copy operator commands from it without checking current docs/code.

### Current reconciled baseline

The current documentation reconciliation baseline from which this naming cleanup was prepared is:

`40c29bfc59f6e51f1742784824110cd53e907de7`

Commit subject:

`Reconcile runtime and Goose Control documentation`

## Draft PR design inputs

### PR #26 — runtime docs / naming cleanup proposal

Draft PR #26 (`Draft: make Goose runtime docs authoritative and retire legacy naming`) was intentionally written as a design/reconciliation proposal from an older base, not as a branch to merge mechanically.

Most of its architecture/lifecycle cleanup was superseded by the later current-main documentation reconciliation. Its remaining useful ideas are preserved in the current [`../naming.md`](../naming.md) and this historical index.

Do not revive its older provisional lifecycle/autostart status over current evidence.

### PR #25 — Goose Control design input

Draft PR #25 remains historical/cross-project design input only. Goose Control's active ownership and planning moved to the separate Day Shift project; it is not part of Electron BrowserHost ownership.

## Retired architecture categories

### Managed Chrome as primary browser transport

Managed Chrome proved important early provider, tool, continuation, and delegation behavior. It is no longer the current primary transport. Do not reintroduce managed-Chrome lifecycle/focus assumptions into Electron work without new evidence.

### Inherited launcher-owned runtime supervision

The current standalone Goose runtime deliberately separates ownership:

- Electron owns BrowserHost only;
- Responses daemon is independently supervised;
- Secure MCP Tunnel is independently supervised;
- Goose owns logical agent/session/tool state.

Historical instructions that let Electron adopt daemon/tunnel ownership are retired.

### Inherited Codex-oriented names

Old `codex*` package, service, environment, script, and action identifiers are compatibility/migration debt, not current conceptual architecture names.

Their eventual mechanical migration is deliberately preserved in [`../naming.md`](../naming.md). Until that migration is performed and proven, literal legacy identifiers may still exist in code or installed state and must not be renamed casually.

## Historical-use rule

When current documentation, current code, and an exact-revision live proof disagree materially, stop the architecture/lifecycle change and reconcile the discrepancy. Historical material is evidence for understanding the past, not permission to override the present operating contract.
