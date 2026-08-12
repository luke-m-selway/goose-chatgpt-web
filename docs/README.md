# Documentation map

This repository is in an active migration from inherited browser-bridge code to a Goose-owned runtime. Documentation is therefore classified by **authority** so that agents do not mistake an old design, a deferred proposal, or an inherited implementation concept for the current operating contract.

## Authority order

When documents disagree, use this order:

1. **Current runtime documentation** in this section.
2. **Current code and focused live proofs** for the exact revision being operated.
3. **Active roadmap** for work that is intentionally not complete yet.
4. **Deferred proposals** only when that proposal is explicitly resumed.
5. **Historical material** only for archaeology; never as an operating instruction.

Do not infer runtime ownership or startup behavior from a filename alone.

## Current runtime documentation

- [`../README.md`](../README.md) — project purpose, current architecture, status, and entry points.
- [`architecture.md`](architecture.md) — component ownership and request/tool flow.
- [`runtime-lifecycle.md`](runtime-lifecycle.md) — current standalone Goose process topology and the cold-start/shutdown contract being qualified.
- [`security-model.md`](security-model.md) — trust boundaries and capability flow.
- [`naming.md`](naming.md) — normative terminology and the legacy-name retirement plan.
- [`../AGENTS.md`](../AGENTS.md) — mandatory safety and lifecycle rules for coding agents.

## Active roadmap

- [`roadmap.md`](roadmap.md) — only the current and next milestones. It is intentionally short.

The previous chronological roadmap became a useful engineering diary but a poor source of current truth. Its exact pre-cleanup form is preserved in repository history; see [`history/README.md`](history/README.md).

## Deferred proposals

Deferred designs are **not** runtime documentation and must say so at the top of the document or PR.

- Goose Control — deferred until the Electron BrowserHost and deterministic startup contract are reliable. The detailed design is maintained in draft PR #25 rather than treated as current runtime documentation.
- Future browser-host/control-plane optimization — deferred architecture research maintained in draft PR #23.

## Historical material

[`history/README.md`](history/README.md) indexes retired or superseded designs and the exact repository revisions that preserve them. Historical material exists to explain why the current architecture looks the way it does; it must not be used as a start/restart recipe or as evidence of current ownership.

## Terminology rule

**Goose is the outer harness.** References to Codex are reserved for the actual Codex agent/ACP specialist when it is deliberately invoked as an external development worker. Inherited product names, connector names, package metadata, service labels, and helper/action names that still contain `codex` are legacy identifiers scheduled for removal; see [`naming.md`](naming.md).
