# CGW foundation-first implementation plan — current state after 2026-08-22 closeout

## Purpose and authority

This document is the current **implementation-order/planning authority** for the `goose-chatgpt-web` reliability workstream.

PR #31 remains the chronological incident/evidence ledger. Historical failures, traces and reconstruction details belong there and in its timestamped comments; this document intentionally does not duplicate that evidence trail.

The remote planning branch is documentation-only and does not reconcile or contain the materially advanced local `fix/electron-native-liveness` lineage.

## Current local implementation checkpoint

Current local checkpoint:

`64f006bed52b0c3366178c3be11f71acf1c397c2`

This is the latest completed local foundation checkpoint known to this plan. It is recorded as local implementation evidence only; do not infer that this documentation branch contains that SHA.

## Architecture invariants

Unless new contradictory evidence appears:

1. Goose owns durable logical session/history, tools, orchestration, cancellation and context lifecycle.
2. A genuinely new human turn gets fresh provider execution and a fresh ChatGPT Temporary Chat; prompt-content equality is not an idempotency contract.
3. Exact transport retries and tool-result rounds of the same owning turn may retain that turn's execution identity.
4. Independently owned Goose operations may overlap; do not serialize by `agent-session-id` merely to eliminate multiple surfaces.
5. Browser/Temporary-Chat state is disposable and must not become canonical conversation state.
6. Electron/BrowserHost native lifecycle/network evidence outranks weak DOM/Playwright symptoms where native evidence is available.
7. Passive observability must not acquire request-blocking authority.
8. Do not solve liveness/control failures by casually inflating existing timeout budgets.
9. Keep the Goose → Responses daemon → Electron BrowserHost → helper/Playwright topology unless substantially stronger evidence requires redesign.

## Foundation gates — completed

The earlier future-tense Gates 1–4 and CGW-013 instructions are superseded by the completed state below.

### CGW-009 — CLOSED / live-proved

Final matcher checkpoint in the local lineage:

`a16c51a25866c84f209e6df09bc521c2c051461e`

The provider now has exact-once submission semantics based on Electron-native evidence. The live-proved current ChatGPT submission route is:

`POST /backend-api/f/conversation`

Acceptance authority requires the exact owned request, send epoch/causal sequencing, matching Electron request ID and matching 2xx response-start. `/backend-api/conversation/init`, `/backend-api/f/conversation/prepare` and sibling routes do not qualify. Exactly-one-Enter behavior was live-proved.

### Gate 2A — CLOSED / live-qualified

Checkpoint:

`f0961960d210776a7498cd7b0b78318a9fdc5e1a`

Completed-stream reconciliation no longer relies on positional DOM block identity. The buffer uses cumulative semantic-Markdown prefix/coverage semantics, tolerates benign DOM split/merge/reparent/index churn, preserves meaningful whitespace and atextual Markdown, never retransmits committed output, and still fails closed on genuine committed semantic mutation/removal with bounded privacy-safe divergence evidence.

Normal operation was live-qualified after activation.

### Gate 2B / Incident B — CLOSED / qualified

Checkpoint:

`d9a16e4af44be4fbb147c9bc7bb365972d375f26`

The observed “missing completion action” recurrence was proven to expose the exact response-turn control:

`button[data-testid="regenerate-thread-error-button"]`

That state is now recognized as a retryable ChatGPT thread-error terminal rather than being left to the generic 60-second missing-completion-action watchdog. Partial already-streamed output remains irreversible; the final error stub is not committed as answer text. Normal-operation qualification passed with no false positive.

A hypothetical successful settled answer with neither completion action nor thread-error control has not been observed under current instrumentation; existing watchdog evidence remains sufficient if it occurs naturally.

### CGW-017 — CLOSED / live-qualified

Checkpoint:

`136a3bf828e0e4c3d8238bc5089857c1237af204`

The remaining readable-but-false-running liveness class is bounded.

- Adapter `{type:"heartbeat"}` events no longer reset the generic bridge's semantic-progress stall budget.
- Bridge-generated `response.heartbeat` client keepalives remain intact.
- Genuine text/reasoning/tool/web-search progress still renews the budget, so there is no absolute generation lifetime.
- `running=true` + connection-interrupted evidence + static progress for the bounded interval now produces the classified retryable terminal `chatgpt_upstream_connection_interrupted_stall`.
- The earlier continuously-unreadable-response bound remains intact.

Normal operation was live-qualified on this checkpoint.

### CGW-013 — CLOSED

Current local checkpoint:

`64f006bed52b0c3366178c3be11f71acf1c397c2`

Ordinary `bun run verify` is now browser/runtime-hermetic. It retains deterministic unit/type/build/runtime-bundle/notices/relocated-daemon release smoke work, but does not launch or discover real Chrome/Electron/BrowserHost or authenticated ChatGPT state.

Managed-Chrome compatibility remains explicit behind:

`bun run smoke:managed-chrome`

and is deliberately exercised in macOS CI/release. `bun audit` and dependency installation remain documented network-dependent steps; CGW-013 did not redefine ordinary verification as fully offline.

## Active next foundation item

### CGW-007 / Incident A — DESIGN-READY / NEXT

Read-only Ox Alpha prescope has made this implementation-ready.

Important correction to older speculation: broker `claim` does **not** wait for invocation availability, EOF/read-first state, queue work, outstanding tool delivery or a lock/semaphore. The current claim path validates the token, creates or reuses its binding and returns synchronously.

The approximately five-second timeout is client-side in `callTurnBroker()` and acts as a broker-path liveness detector. Incident A therefore represents delayed broker response service before child provider/browser creation, not BrowserHost capacity exhaustion.

Most likely mechanism: transient daemon event-loop/service starvation under concurrent activity. The exact starvation trigger remains unlocalized.

Implementation contract:

1. Preserve prompt-return, idempotent claim semantics.
2. Add a **bounded idempotent-safe retry for claim only** on the appropriate response timeout classes; no polling loop and no global timeout inflation.
3. Add bounded scalar claim latency/state telemetry sufficient to distinguish connect, response-start and response-settlement delay and to correlate token/binding/queue/invocation state.
4. Optional cheap daemon event-loop lag telemetry is acceptable if it remains observation-only and materially improves localization.
5. Do not alter `nextToolBatch`, tool-delivery exact-once semantics, context staging/EOF semantics or intentional non-TTL invoke waiting.

CGW-007 should be implemented and deterministically validated before moving to CGW-006.

## Following foundation item

### CGW-006 — healthy streaming lifetime

The root cause is already established in Goose's custom OpenAI/Responses provider: the default ~600-second timeout is applied as an absolute reqwest request/body lifetime.

Required contract:

- no absolute total response-body lifetime for a healthy streaming Responses request;
- explicit caller cancellation remains authoritative;
- connection/setup bounds may remain;
- any stalled-stream bound must be genuine inactivity/read/progress semantics that reset on successful reads;
- non-streaming timeout behavior remains unchanged;
- preserve underlying network/reqwest causality.

Proof should be hermetic and scaled with a local SSE server; do not use a 600-second wall-clock ChatGPT run and do not replace 600 seconds with an arbitrarily huge absolute timeout.

CGW-006 is expected to be the final major known foundation correctness fix before the qualification sequence below.

## Qualification sequence after CGW-006

The following order remains normative unless new evidence changes a dependency.

### 1. Current-HEAD single-agent qualification

Run an ordinary ChatGPT-Web/high session that proves:

1. fresh human turn;
2. useful Goose Native tool round;
3. normal final completion;
4. a **genuine second human turn in the same Goose session**;
5. another bounded useful tool/completion round;
6. clean settlement to HTTP/browser `0/0`.

This is the point where ordinary same-Goose-session multi-turn operation is requalified on the accumulated foundation fixes.

### 2. CGW-010 large-context qualification

Resume the existing PR #32 workstream at its remaining qualification gate rather than redesigning the context feed.

Already-proven mechanics include a real ~19,684-character feed loaded `0 → 16000 → 19684`, EOF before normal task tools, and useful post-EOF work. Remaining qualification should prove clean settlement, dependent later continuation using earlier-session facts, and the small inline control.

### 3. Manual concurrency requalification

On current hardened HEAD:

1. ordinary/manual parent + 1 ChatGPT-Web child;
2. ordinary/manual parent + 2 ChatGPT-Web children.

The topology has already been proven viable historically; this is regression qualification, not architecture discovery. Do not optimize for unnecessary fan-out beyond the realistic operating envelope.

### 4. Goose Control route qualification

Only after the ordinary provider path is stable:

1. repeated fresh GC-started ChatGPT-Web turns;
2. GC parent + 1;
3. GC parent + 2.

Keep Goose Control/ACP/session-list defects separate from ChatGPT-Web BrowserHost/provider failures.

### 5. Deferred recovery/lifecycle/resource work

Then revisit only as evidence/priority warrants:

- CGW-005 final ecological recovery-skill qualification;
- CGW-011 provider-demand BrowserHost/lifecycle design;
- CGW-012 actual reboot/login reconstruction proof;
- Electron/helper memory/resource attribution;
- parent+3/stress work;
- larger simplification/backlog items.

## Operational and agent-routing posture

- ChatGPT-Web **High** is the default ChatGPT-Web implementation model; Medium is only preferred when speed/latency specifically matters.
- Use ChatGPT-Web where success/failure itself gives meaningful ecological evidence about ChatGPT-Web.
- Use Ox Alpha for source forensics, recovery, implementation and qualification where ChatGPT-Web is merely instrumental.
- If a ChatGPT-Web Goose turn fails after potentially doing useful source work, prefer switching that **same Goose session** to Ox Alpha for recovery rather than repeatedly restarting.
- Opus is a limited-usage escalation/review resource when competent Ox passes fail to converge, diagnoses conflict, work is cycling, or a high-risk semantic/diff review merits the cost.
- One ChatGPT-Web agent at a time.
- Avoid unnecessary parallel heavy local workloads while the hypothesis that MBP load amplifies Electron/Playwright latency remains unproven but plausible.

## Qualification discipline

- Prefer natural useful/ecological workloads after deterministic coverage exists.
- Do not manufacture rare failure branches merely to collect evidence unless qualification explicitly requires it.
- Do not retry an unclassified qualification failure merely to obtain a pass.
- Preserve exact gate acceptance criteria, failure causality and privacy-safe evidence.
- A higher-level pass may require requalification when a lower-level foundation changes materially.
- Harness/tool-policy blocks are not BrowserHost failures without direct evidence.

## Branch and PR relationship

This planning PR remains documentation-only and intentionally starts from `main`.

It does **not** reconcile, push or overwrite the local `fix/electron-native-liveness` implementation lineage. Local checkpoint `64f006bed52b0c3366178c3be11f71acf1c397c2` is a recorded planning reference, not a commit on this documentation branch.

PR #31 remains open as the chronological incident/evidence ledger. Its older body is historical context and must not override this current planning document or the newer timestamped closeout comments.

PR #32 remains the dedicated CGW-010 design/evidence stream and resumes only at the large-context qualification stage above.

Before eventual final merge/closeout of the reliability workstream, deliberately reconcile local implementation history with remote PR history, preserve protected local scripts/intentional state, verify exact final HEAD, update canonical statuses from actual evidence, and leave merge/close decisions to the human operator.
