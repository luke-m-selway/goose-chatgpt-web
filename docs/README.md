# Documentation map

This directory is the authoritative handoff for the current Goose-first runtime and the next active project milestone.

## Status labels

- **current/proven** — implemented and exercised against the named/current revision; safe to use as the present operating contract.
- **active** — the next implementation milestone; design decisions are current, but implementation/proof is not complete yet.
- **provisional** — a current design detail that still has an explicitly named proof or decision outstanding.
- **deferred** — intentionally later work, not a first-proof requirement.
- **historical** — superseded engineering evidence retained in Git/old PRs; not an operating instruction.

## Current/proven runtime documentation

- [`../README.md`](../README.md) — current project shape and status.
- [`architecture.md`](architecture.md) — ownership and request/tool flow.
- [`runtime-lifecycle.md`](runtime-lifecycle.md) — canonical lifecycle, BrowserHost readiness, macOS autostart, and remaining reboot proof.
- [`security-model.md`](security-model.md) — current trust/capability boundaries.
- [`naming.md`](naming.md) — current Goose-first terminology plus the explicitly deferred mechanical runtime/ABI naming migration.
- [`../AGENTS.md`](../AGENTS.md) — mandatory runtime/safety rules for agents.

The current reconciled documentation baseline is `40c29bf`. The qualified Electron/lifecycle evidence underneath it includes the Electron checkpoint `c624274` and ordered-autostart checkpoint `dd44b74`.

## Active milestone

- [`goose-control-plan.md`](goose-control-plan.md) — historical/cross-project Goose Control material retained here for context; active Goose Control ownership/planning has moved to Day Shift and must remain above the provider/browser transport boundary.
- [`roadmap.md`](roadmap.md) — current and next work only.

## Provisional / not yet proven

The actual Mac **reboot/login → automatic reconstruction → ordinary Goose first turn → separate dependent `--resume`** proof has not been run. Ordered autostart is implemented and live-checked without that reboot boundary.

No document may silently upgrade that item to proven status.

BrowserHost support for multiple simultaneous turn surfaces is structural, but ChatGPT-Web parent → ChatGPT-Web child fan-out remains a separate live qualification until explicitly proven and documented.

## Deferred

### Mechanical naming migration

The current architecture names are already Goose-first, but inherited persisted/runtime/public identifiers still include legacy `codex*` names. Their migration is deliberately deferred to a dedicated compatibility milestone documented in [`naming.md`](naming.md).

That future work includes at least:

- `CODEX_CHATGPT_WEB_*` environment/config identifiers;
- `io.github.codex-chatgpt-web.*` service/launchd labels;
- `codex_tool_call` and related connector-visible MCP/action names;
- `scripts/start-goose-launcher.ts`;
- package/bin/application names;
- runtime/application-support directories and other persisted identifiers.

Do not rename these piecemeal during unrelated feature/reliability work. Public connector schema caching, installed service state, autostart, browser authentication state, and upgrade compatibility must be handled explicitly.

## Historical/design inputs

- [`history/README.md`](history/README.md) — index of retired architecture/documentation and immutable checkpoints for archaeology.
- Draft PR #25 refined Goose Control around native ACP and remains useful historical/cross-project design evidence; active ownership is now Day Shift.
- Draft PR #26 proposed the documentation authority/naming split. Most of its runtime cleanup was superseded by current `main`; its remaining useful naming/history intent is reconciled into [`naming.md`](naming.md) and [`history/README.md`](history/README.md). Do not merge PR #26 mechanically.
- The previous long chronological roadmap remains available in Git history at `dd44b74`; use it for archaeology only, not for current priorities or lifecycle instructions.

When historical material conflicts with current code/proofs and the current documents above, use the current documents. If current docs themselves materially disagree with current code or an exact-revision live proof, stop the architecture/lifecycle change and reconcile the discrepancy rather than silently choosing one.
