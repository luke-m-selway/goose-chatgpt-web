# Documentation map

This directory is the authoritative handoff for the current Goose-first ChatGPT-Web runtime. Goose Control implementation now belongs in the separate `luke-m-selway/day-shift` repository.

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
- [`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md) — authoritative 2026-08-14 reliability closeout, deployed revision, operating envelope, and remaining unknowns.
- [`chatgpt-web-flight-recorder.md`](chatgpt-web-flight-recorder.md) — passive trace, transport, broker, retry, and Electron-native screenshot evidence for ordinary use.
- [`security-model.md`](security-model.md) — current trust/capability boundaries.
- [`../AGENTS.md`](../AGENTS.md) — mandatory runtime/safety rules for agents.

The proven lifecycle/autostart base remains Electron checkpoint `c624274` plus current-main autostart
commit `dd44b74`. Draft PR #31's development runtime is separately deployed at
`7f99f187295135de1507c3fcd63aca08e9c01810`, with passive observation enabled. That deployment fixes a
naturally observed diagnostic/control-path self-interference issue but does not upgrade reliable
parent-plus-two-child completion to proven status.

## Active reliability posture

- [`chatgpt-web-reliability-closeout.md`](chatgpt-web-reliability-closeout.md) is the current source of
  truth. Native liveness design/review, ordinary multi-turn use, native ChatGPT-Web delegation, genuine
  parent plus two async ChatGPT-Web child topology, and genuine three-surface overlap are established.
  Reliable parent-plus-two-child completion remains **NOT QUALIFIED**.
- [`chatgpt-web-flight-recorder.md`](chatgpt-web-flight-recorder.md) documents the active passive
  observation phase and its privacy/storage boundaries.
- [`chatgpt-web-concurrency-qualification.md`](chatgpt-web-concurrency-qualification.md) is retained as
  qualification procedure and earlier evidence. Its deployed-revision status header predates the
  `7f99f187...` closeout; do not use it to override the closeout document's current status.

Designated synthetic qualification remains paused. Use ChatGPT-Web normally and let ordinary single-agent,
multi-turn, and genuinely useful delegated work accumulate ecological evidence. The practical ordinary
concurrency recommendation is parent + at most one ChatGPT-Web child at a time for now.

## Goose Control boundary

Goose Control work has resumed in:

- GitHub: `luke-m-selway/day-shift`
- local: `/Users/luke/Documents/day-shift`

It remains provider-agnostic Planner-to-Goose control. It is not an Electron BrowserHost feature and
should not acquire ChatGPT-Web-specific recovery/orchestration logic.

[`goose-control-plan.md`](goose-control-plan.md) remains useful planning/design context, but current
implementation truth must be taken from the Day Shift repository and its active Goose Control work.

## Provisional / not yet proven

The actual Mac **reboot/login → automatic reconstruction → ordinary Goose first turn → separate dependent `--resume`** proof has not been run. Ordered autostart is implemented and live-checked without that reboot boundary.

Reliable parent-plus-two-child completion remains unqualified despite established topology and overlap.
Two earlier roughly 603–606 second outer Responses-body failures also remain unlocalized. Ordinary-use
passive evidence is the chosen next qualification phase.

No document may silently upgrade those items to proven status.

## Deferred / later reliability items

- pre-Goose-Native startup latency, if it remains disruptive;
- large-prompt attachment performance (a natural incident measured about 21.2 seconds for a ~24.6k-character prompt versus about 2.8 seconds for a shorter control);
- heavier instrumentation only if the passive corpus exposes a specific evidence gap;
- another designated concurrency run only if later evidence creates a concrete reason to run one.

## Historical/design inputs

- Draft PR #25 refined Goose Control around native ACP and remains useful design evidence, but its write-capable custom-MCP-first Planner surface and async-first MVP are superseded by later Day Shift implementation work.
- Draft PR #26 proposed a useful documentation split and lifecycle clarification, but its pre-autostart provisional runtime status is superseded by current `main` plus this reconciliation.
- The previous long chronological roadmap remains available in Git history at `dd44b74`; use it for archaeology only, not for current priorities or lifecycle instructions.

When historical material conflicts with current code/proofs and the current documents above, use the current documents.
