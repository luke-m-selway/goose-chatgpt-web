# CGW foundation-first implementation plan — current planning authority after 2026-08-24 reboot

## Purpose and authority

This document and PR #35 are the current **implementation-order/planning authority** for `goose-chatgpt-web`.

PR #31 remains the chronological incident/evidence ledger. Do not duplicate its historical trace record here.

This documentation branch is intentionally separate from the materially advanced local `fix/electron-native-liveness` lineage. Do **not** push, overwrite or reconcile that implementation branch merely to update planning documentation.

## Current local implementation state

Activated diagnostic checkpoint:

`0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6`

Qualified behavioral baseline:

`6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8`

`0b89d5e` is diagnostic-only. It added `browser_page` connection-step localization plus helper/Electron-main loop-lag observation and passed independent review/full tests. It has zero behavioral authority.

## Completed reliability foundation — preserve through redesign

Keep these gates closed:

- **CGW-009 — CLOSED / live-proved:** exact-once submission on the real ChatGPT conversation POST path.
- **Gate 2A — CLOSED / qualified:** semantic Markdown reconciliation, fail-closed on committed-output mutation/removal.
- **Gate 2B — CLOSED / qualified:** exact thread-error classification.
- **CGW-017 — CLOSED / live-qualified:** semantic progress separated from mere adapter liveness; bounded terminal for interrupted/static-running shape.
- **CGW-013 — CLOSED:** ordinary verification is browser/runtime-hermetic.
- **CGW-007 / Incident A — CLOSED / qualified:** bounded claim-only typed timeout retry and claim telemetry.
- **Residual transport-terminal execution retirement — CLOSED / qualified at `6d4bea1`.**

Treat these as invariants to transplant into simpler ownership, not implementation machinery that must be copied wholesale.

CGW-006's historical ~600-second absolute streaming Responses-body deadline has already been repaired upstream in Goose 1.46.0. The active `/Applications/Goose.app` was observed reporting 1.46.0; `~/.local/bin/goose` remains 1.45.0. Do not reimplement CGW-006 locally from the old plan without a specific unresolved dependency.

PR #32 / CGW-010 large-context work remains separate unless a dependency is unavoidable.

## Reboot experiment — completed

The full macOS reboot/login proof was run on 2026-08-24.

Correct verdict:

- automatic ChatGPT-Web infrastructure reconstruction: **FAIL / NOT QUALIFIED**;
- manual canonical post-reboot bring-up: **PASS**;
- old `reboot proof NOT RUN` status: **superseded**.

Exact active runtime remained `0b89d5e`.

Independent raw DevTools pre-turn baseline was healthy: `/json/version` total ~17.3 ms; raw WS connect ~46.2 ms; `Browser.getVersion` ~4.86 ms; total raw CDP check ~51.1 ms.

The first post-reboot manually initiated `chatgpt-web/high` run had dramatically healthier startup/control behavior and completed substantial genuine Goose Native work. It later surfaced `chatgpt_retry_circuit_open`. That is a secondary guard; the causal failure that opened the circuit remains unresolved unless later trace evidence establishes it.

Do not claim the reboot fixed ChatGPT-Web. The result supports host/runtime accumulated state as a contributor to some earlier severe pathology while leaving other failure classes open.

## Current evidence motivating architecture review

Trace `df0fa0069ad9` remains the strongest pre-reboot discriminator for the severe composer/control-stall family:

- Browser and target CDP probes timed out together and late-resolved together after roughly 34 seconds;
- Electron BrowserHost main did not show corresponding loop stall;
- renderer/backend activity remained alive;
- host VM pressure did not explain the decisive episode.

This narrows one failure toward the shared Playwright-client ↔ Chromium DevTools serving/control segment, but does not prove that CDP itself is universally causal.

The architectural issue is broader: current top-level lifecycle ownership is fragmented across Electron BrowserHost, Responses daemon and Secure MCP Tunnel, and the real reboot proof showed the automatic reconstruction contract did not work.

## Governing architectural decision

The prior constraint that Electron must remain BrowserHost-only is relaxed.

Primary goal:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

Secondary goal:

```text
minimise idle resources where that stays simple
```

The replacement boundary moves upward:

- Goose remains one application and the durable logical agent/session/tool/context authority.
- ChatGPT-Web becomes one self-contained provider application.
- Electron is today's implementation candidate for that application.
- If Electron later proves unsuitable, replace the whole ChatGPT-Web provider application behind the same stable Goose-facing contract.

Process separation remains allowed where useful. The simplification is one top-level lifecycle owner, not a forced monolith.

## Candidate north-star boundary

```text
Goose
  │ stable provider contract
  │ default candidate: Responses-compatible HTTP/SSE
  ▼
ChatGPT-Web Application
  ├─ Responses/provider endpoint
  ├─ authenticated ChatGPT browser
  ├─ browser surfaces and automation
  ├─ provider execution/retry state
  ├─ Goose Native bridge
  ├─ MCP server / secure tunnel
  ├─ helper children where useful
  ├─ health/readiness
  └─ startup/shutdown/reconstruction
```

Goose continues to own sessions/history, context/compaction, tools/approvals, delegation and project execution. Browser chats remain disposable transport/cache state.

Do not assume ACP is the right primary boundary merely because it is an agent protocol. ChatGPT-Web is functioning primarily as a Goose **model provider**. Preserve the existing Responses-compatible provider contract in Phase 1 unless scouting identifies a materially better native Goose provider boundary.

MCP/Goose Native remains the likely reverse tool path, with MCP/tunnel machinery internalized under the ChatGPT-Web application owner.

## PR #33 / resource policy

The earlier provider-demand/low-resource design is now secondary.

Lazy startup of Chromium or other expensive children is desirable only if it falls out naturally inside the single owner. If it adds lifecycle complexity, cross-process coordination, special recovery or weakens `open ChatGPT-Web → provider appliance READY`, defer it.

## Mandatory parallel / rollback-capable migration

Do **not** rebuild by tearing down the working `0b89d5e` path first.

```text
existing provider path        remains available
         │
         ├── current known-good/diagnostic baseline
         │
new integrated app path       developed alongside it
```

Phase 1 should consolidate lifecycle/ownership while preserving the current Goose-facing Responses contract and as much existing browser behavior as practical.

Required integrated-mode proof sequence:

1. app starts all required internal infrastructure;
2. health/readiness passes;
3. ordinary read-only ChatGPT-Web turn passes;
4. Goose Native/tool-capable turn passes;
5. continuation/multi-turn passes;
6. quit/reopen reconstruction passes;
7. only then make integrated mode the normal path;
8. retain the old path briefly as rollback;
9. delete old independent-supervision machinery only after replacement proof.

Development may be substantial; ChatGPT-Web must not be unavailable throughout the rebuild. Downtime is limited to bounded qualification/cutover windows.

The design and Opus review must reject any architecture that violates this availability/rollback requirement.

## Phase 2 question — Playwright/CDP critical path

Treat browser-control redesign as a separate layer from lifecycle consolidation.

Current external path is approximately:

```text
helper/worker
  → Playwright
      → remote CDP
          → Electron/Chromium
              → ChatGPT
```

Evaluate, stage by stage, whether Electron-owned facilities can reduce complexity:

- `webContents` navigation/load events;
- trusted input;
- narrowly scoped `executeJavaScript`;
- preload/contextBridge/IPC where safe;
- `session.webRequest`;
- `webContents.debugger` as a possible intermediate Electron-owned CDP path.

Potential migration order:

1. navigation/readiness;
2. effort selection;
3. connector attachment;
4. prompt insertion;
5. submission;
6. response observation;
7. tool continuation;
8. completion/error observation.

Keep the old path as reference/diagnostic while migrating. Do not remove Playwright merely for ideological purity, and do not replace its useful auto-waiting with brittle custom polling.

## Verified upstream direction so far

Current upstream `miuuyy/codex-chatgpt-web` is newer than the earlier handoff snapshot; `main` has reached release **v3.0.2** on 2026-08-24.

Current upstream architecture explicitly makes the launcher the sole process supervisor across macOS/Windows/Linux while retaining a Responses-compatible provider surface and Playwright attached to launcher-owned Electron surfaces over loopback CDP. Upstream also contains historical Electron-owned trusted-input work using `webContents.debugger`, but present `main` must be inspected carefully to determine what was retained, removed or superseded.

Do not blindly rebase onto upstream. Use it as a source of architecture simplification, deletions and transplantable lifecycle/browser-control ideas while preserving fork-qualified reliability invariants.

## Required scouting before design freeze

### A. Current ownership/process map

Establish from current source:

- every top-level runtime process;
- who starts/supervises/stops it;
- crash/restart/readiness behavior;
- launchd ownership;
- descriptor/socket identities;
- which ownership boundaries exist only because of the earlier Electron-replaceability policy.

Return which boundaries disappear under one application owner.

### B. Browser-control critical-path map

Trace BrowserHost creation → surface creation → Playwright/CDP connection → navigation → Temporary Chat readiness → effort → Goose Native attachment → prompt insertion → submit → response observation → tool continuation → completion/reconciliation → cleanup/recovery.

For each stage classify whether it genuinely needs Playwright, can cleanly use Electron-native control, can use preload/contextBridge, can use `webContents.debugger`, or should remain unchanged initially.

### C. Reliability invariant map

Locate implementation ownership for exact-once send, semantic reconciliation, error classification, progress/liveness, retry claim, terminal retirement, surface cleanup, execution identity and tool continuation.

### D. Current-upstream delta

Compare current fork with current upstream only for lifecycle supervision, Electron/browser integration, Playwright/CDP boundary, direct Electron browser control, MCP/tunnel ownership, provider boundary, recovery/retry, auth/session handling and macOS/Linux portability.

## Mandatory fresh Opus adversarial review

After the planner has one coherent design and a precise current → target architecture/code diff, send design + diff + upstream findings + relevant failure evidence to a **fresh Opus** agent.

Opus should try to break the proposal, especially for:

- circular lifecycle dependencies;
- self-interference/deadlocks/restart loops/failure amplification;
- provider availability during browser restart;
- MCP/tunnel reconnect semantics;
- tool continuation across child restart;
- execution identity/retry-circuit ownership;
- stale state after partial crashes;
- exact-once/reconciliation/progress regressions;
- preload/IPC/remote-content security;
- Electron main-thread blocking;
- merely relocating the same CDP problem;
- replacing Playwright auto-waiting with fragile polling;
- macOS/Linux implications;
- migration/rollback and existing user state;
- opportunities to delete more machinery;
- useful upstream solutions already available.

Instruction to Opus: **prefer lean structural fixes and deletion over additional watchdogs/retries/instrumentation.**

Reconcile real Opus findings into the plan before implementation.

## Governing design principles

- native before custom;
- prevent before recover;
- leanest adequate solve;
- evidence before mechanism;
- retries only at native/idempotent boundaries;
- observability remains observational;
- timeouts are safety nets, not normal control flow;
- deterministic proof first, ecological evidence second;
- prefer one clear owner over cross-process coordination where replaceability can live at the external contract;
- delete machinery rather than add recovery logic where possible.

## Stop boundary

No integrated-app implementation, destructive reconciliation, merge/rebase/reset, old-path deletion or normal-path cutover is authorized yet.

Finish documentation reconciliation, current/upstream scouting, coherent architecture, current→target diff and fresh Opus adversarial review. Then return the reconciled implementation plan for user review before implementation.
