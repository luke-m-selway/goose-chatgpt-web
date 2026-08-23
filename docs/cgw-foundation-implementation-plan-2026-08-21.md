# CGW foundation-first implementation plan — current state after 2026-08-23 closeout

## Purpose and authority

This document is the current **implementation-order/planning authority** for the `goose-chatgpt-web` reliability workstream.

PR #31 remains the chronological incident/evidence ledger. Historical failures, traces and reconstruction details belong there and in its timestamped comments; this document intentionally does not duplicate that evidence trail.

The remote planning branch is documentation-only and does not reconcile or contain the materially advanced local `fix/electron-native-liveness` lineage.

## Current local implementation state

Current local/activated checkpoint:

`10155028925c1919f6c346f76802e1acad547030`

Qualified semantic parent baseline:

`6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8`

`1015502` is a reviewed, diagnostic-only child of the qualified `6d4bea1` baseline. It is active in the development runtime and has zero behavioral authority.

This is local implementation evidence only; do not infer that this documentation branch contains either SHA.

## Immediate planning priority

### Re-establish a clean manually initiated ChatGPT-Web session

The first priority for the next planning session is **not** another CGW implementation gate by default. It is to establish a clean ordinary/manual `chatgpt-web/high` Goose run again.

Use a manually initiated ordinary Goose session, not Goose Control. One ChatGPT-Web agent at a time.

If the manual run is clean, that is positive ecological evidence that ChatGPT-Web can return to normal source/review work and the planner may resume the remaining CGW sequence below.

If the manual run fails in the current pre-submit/control family, preserve the runtime and trace before restarting anything. The active `1015502` discriminator is specifically armed to classify that natural recurrence. Inspect the `cdp-stall-*`, worker-drift and existing BrowserHost/daemon evidence before making another source change.

Only continue with a CGW issue while ChatGPT-Web is still failing if that issue **directly aligns with the failure currently being observed**. Otherwise pause implementation and keep using ordinary manual ChatGPT-Web workloads as the natural qualification surface.

Do not manufacture a rare failure solely to trigger instrumentation.

## Current open ChatGPT-Web reliability boundary

Repeated natural manual ChatGPT-Web runs have recently failed before useful model work in several forms, including:

- `locator.count()`/composer operations that remain pending for tens to hundreds of seconds;
- `pressSequentially("@Goose Native")` timing out after partial typing;
- an enabled `send-button` resolving correctly but `press("Enter")` never settling.

The strongest instrumented recurrence, trace `f4d376de5611`, established that during a 208-second `composer_ready` stall:

- Electron BrowserHost JS main-loop telemetry showed no corresponding stall;
- BrowserHost control HTTP continued servicing heartbeats;
- helper liveness continued;
- Electron-native screenshots continued succeeding;
- the renderer/compositor remained visibly responsive;
- the Playwright/CDP automation operation did not settle.

Therefore the current causal boundary is **below the Electron JS/control orchestration layer, in the Playwright ↔ Chromium CDP automation path**.

Do not reinterpret a visibly responsive renderer as proof that CDP automation is healthy.

### Active diagnostic checkpoint — `1015502`

`1015502` adds one bounded diagnostic episode per turn only after an existing critical Playwright operation becomes slow. It reuses the existing `chromium.connectOverCDP()` automation transport and adds no second DevTools observer connection.

The episode measures:

- browser-level CDP: `Browser.getVersion`;
- target-level CDP: `Runtime.evaluate("1")` on the active page target;
- worker drift: bounded event-loop lag and CPU delta.

Interpretation:

- browser probe slow/hung → Chromium browser-process DevTools serving or shared dispatch implicated;
- browser fast + target slow/hung → per-target inspector/renderer tier implicated;
- both probes fast while the owning Playwright operation hangs → Playwright/client machinery implicated;
- material worker drift overlapping the episode → Node worker scheduling/starvation becomes relevant.

Known limitation: because both probes intentionally reuse the same native CDP transport, a result where both probes are silent cannot by itself distinguish browser-process DevTools failure from shared WebSocket/IPC dispatch congestion. Do not add a second observer connection merely to remove that ambiguity unless later evidence makes it necessary.

The diagnostic does not change retries, timeouts, cancellation, liveness, surface ownership, error classification or recovery behavior.

## Architecture invariants

Unless new contradictory evidence appears:

1. Goose owns durable logical session/history, tools, orchestration, cancellation and context lifecycle.
2. A genuinely new human turn gets fresh provider execution identity; prompt-content equality is not an idempotency contract.
3. Exact transport retries and tool-result rounds of the same owning turn may retain that turn's execution identity.
4. Independently owned Goose operations may overlap; do not serialize by `agent-session-id` merely to eliminate multiple surfaces.
5. Browser/Temporary-Chat state is disposable and must not become canonical conversation state.
6. Electron/BrowserHost native lifecycle/network evidence outranks weak DOM/Playwright symptoms where native evidence is available.
7. Passive observability must not acquire request-blocking or behavioral authority.
8. Keep the Goose → Responses daemon → Electron BrowserHost → helper/Playwright topology unless substantially stronger evidence requires redesign.

## Governing design principles

Use these principles when selecting or reviewing any repair:

- **Native before custom.** Prefer the authority already owned by Goose, the daemon, BrowserHost/Electron, or Chromium rather than parallel state machines or replacement infrastructure.
- **Prevent before recovering.** Prefer correcting ownership, lifecycle, state transitions, scheduling, backpressure or another causal condition so the invalid/degraded state does not arise. Retries, timeouts, cleanup and recovery remain safety boundaries, not the primary mechanism that makes normal operation reliable.
- **Leanest adequate solve.** Simplify/remove duplicated state before adding new mechanisms. Keep contracts small, explicit and testable.
- **Evidence before mechanism.** Localize the owning layer before implementing. Do not promote correlation, visible UI responsiveness or generic timeout symptoms into causal claims.
- **Resilience at natural idempotent boundaries.** Add bounded retry/recovery only where ownership and idempotency already make it safe.
- **Observability is observational.** Telemetry may explain behavior but must not silently become behavior authority.
- **Timeouts are safety nets.** Do not solve normal-operation reliability by casually increasing global deadlines or layering retries around an unknown obstruction.
- **Deterministic proof first, ecological evidence second.** Use hermetic tests for known contracts and ordinary useful ChatGPT-Web workloads for natural runtime qualification.

Cross-repo policy relationship: Day Shift `docs/goose-boundary.md` is the highest-level native-first build/no-build authority; the Day Shift technical-development-loop workstream is the proper home for the broader engineering-loop principles; Day Shift PR #22 is the canonical inside-Goose delegation policy. This CGW plan applies those principles locally rather than redefining them.

## Foundation gates — completed

### CGW-009 — CLOSED / live-proved

Final matcher checkpoint:

`a16c51a25866c84f209e6df09bc521c2c051461e`

Exact-once submission is live-proved on the real current route `POST /backend-api/f/conversation`, with owned send epoch/trace/surface, matching Electron request ID, matching 2xx response-start and exactly-one-Enter behavior.

### Gate 2A — CLOSED / qualified

Checkpoint:

`f0961960d210776a7498cd7b0b78318a9fdc5e1a`

Completed-stream reconciliation uses cumulative semantic-Markdown prefix/coverage rather than fragile positional DOM identity, preserves meaningful Markdown/whitespace, never retransmits committed output and fails closed on genuine committed semantic mutation/removal.

### Gate 2B / Incident B — CLOSED / qualified

Checkpoint:

`d9a16e4af44be4fbb147c9bc7bb365972d375f26`

The exact `regenerate-thread-error-button` state is classified as a retryable ChatGPT thread-error terminal rather than waiting for the generic missing-completion-action watchdog. Partial output remains irreversible and the error stub is not committed as answer text.

### CGW-017 — CLOSED / live-qualified

Checkpoint:

`136a3bf828e0e4c3d8238bc5089857c1237af204`

Adapter heartbeats no longer masquerade as semantic progress; genuine progress can continue indefinitely, while readable static `running=true` + connection-interrupted evidence has a bounded retryable terminal.

### CGW-013 — CLOSED

Foundation checkpoint:

`64f006bed52b0c3366178c3be11f71acf1c397c2`

Ordinary `bun run verify` is browser/runtime-hermetic. Managed-Chrome compatibility remains explicit behind `bun run smoke:managed-chrome` and retained deliberately in macOS CI/release.

### CGW-007 / Incident A — CLOSED / qualified

Checkpoint:

`e51bd44c62c7e0a5c9f8249f0ab04ad2c53d17d9`

Broker `claim` remains prompt-return and idempotent. The repair adds a bounded claim-only retry for typed response-start/response-settlement timeout classes without inflating the per-attempt five-second liveness bound, plus privacy-safe client/server claim telemetry and daemon loop-lag observation.

Out-of-band activation and an ordinary ChatGPT-Web High qualification passed. CGW-007 is no longer the next implementation item.

### Residual transport-terminal execution retirement — CLOSED / qualified baseline

Qualified checkpoint:

`6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8`

A natural upstream zero-visible-output stall exposed a deterministic local residual lifecycle defect: transport-decided terminal failures could leave the exact-key provider session reusable after broker revocation, causing a same-key retry to inherit stale/revoked execution state.

The qualified repair retires the exact-key session only when the caught error is causally the exact existing `withAbort()` transport abort product, preserving conservative settled replay for genuinely ambiguous worker-origin failures in standalone and non-standalone modes.

Independent review passed. OOB activation passed. An ordinary first turn plus a genuine second human turn in the same Goose session both passed with fresh execution keys, no stale token replay, no unexpected circuit-open state and clean settlement.

## Paused foundation item

### CGW-006 — healthy streaming lifetime

The root cause remains established in Goose's custom OpenAI/Responses provider: the default ~600-second timeout is applied as an absolute request/body lifetime.

Required contract remains:

- no absolute total response-body lifetime for a healthy streaming Responses request;
- explicit caller cancellation remains authoritative;
- connection/setup bounds may remain;
- any stalled-stream bound must be genuine inactivity/read/progress semantics that reset on successful reads;
- non-streaming timeout behavior remains unchanged;
- preserve underlying network/reqwest causality.

Proof should be hermetic and scaled with a local SSE server; do not use a 600-second wall-clock ChatGPT run and do not replace 600 seconds with an arbitrarily huge absolute timeout.

**Current status: PAUSED.** Do not resume CGW-006 merely because it was previously next in the foundation order. Resume it only when manual ChatGPT-Web sessions are clean again or when current evidence shows the active failure is materially the ~600-second body-lifetime class.

## Conditional qualification / implementation sequence

After a clean manually initiated ChatGPT-Web run is re-established, or when current evidence directly aligns with one of these items, continue in this order unless new evidence changes the dependency:

1. **Current-head ordinary manual ChatGPT-Web qualification/use.** Keep using useful real workloads; a genuine second human turn remains valuable evidence when practical.
2. **CGW-006**, if still relevant and not superseded by newer evidence.
3. **CGW-010 large-context qualification** at the remaining PR #32 qualification gate; core ~19.7k-character context-feed mechanics are already proven.
4. **Manual concurrency requalification:** parent + 1, then parent + 2 ChatGPT-Web children.
5. **Goose Control route qualification:** only after the ordinary manual provider path is dependable and GC write/start/continuation use is explicitly reopened.
6. **Deferred recovery/lifecycle/resource work:** CGW-005, CGW-011, CGW-012, memory/resource attribution and non-gating stress/simplification work as evidence warrants.

Do not mechanically advance this list while the current ordinary ChatGPT-Web failure class remains unexplained.

## Goose Control posture

Goose Control is currently **read-only for this planning workstream**.

- Do not start new ChatGPT-Web sessions through Goose Control.
- Do not use GC continuation as a workaround for ordinary ChatGPT-Web failures.
- Read-only inspection/status of a known session is acceptable when it materially helps diagnosis.
- Keep GC/ACP/session-list/start-route defects separate from ChatGPT-Web BrowserHost/provider failures.
- Re-open GC start/continuation qualification only after the ordinary manually initiated ChatGPT-Web path is stable enough to make GC failures interpretable.

## Agent-routing posture

- ChatGPT-Web **High** is the preferred ChatGPT-Web model whenever success/failure itself gives useful ecological evidence about ChatGPT-Web.
- Use ChatGPT-Web for ordinary real work as soon as a clean manual run is plausible; do not wait for an artificial grand requalification.
- If a ChatGPT-Web turn fails after useful context/work exists, prefer switching the **same Goose session** to Ox Alpha or Sonnet for rescue rather than discarding the session.
- Use **Ox Alpha by preference** for source forensics, long investigations, implementation, activation/qualification and other work where ChatGPT-Web itself is merely instrumental. Make substantial use of the available Ox budget.
- Unpinned native async Ox delegates are appropriate for genuinely parallel read-only/source/test strands when the parent owns integration and writes do not overlap.
- Sonnet is primarily a cross-family independent reviewer/escalation route while ChatGPT-Web is unreliable or when independent semantics review is valuable.
- Opus is a limited escalation resource after competent Ox passes fail/conflict/circle or for unusually high-risk semantic review.
- One ChatGPT-Web agent at a time.

## Qualification discipline

- Prefer natural useful/ecological workloads after deterministic coverage exists.
- Do not retry an unclassified ChatGPT-Web failure merely to obtain a pass.
- Preserve a natural failure trace before restarting the runtime.
- Do not add heavier instrumentation unless the active corpus exposes a specific discriminating evidence gap.
- Keep evidence causal and privacy-safe.
- A higher-level pass may require requalification when a lower-level foundation changes materially.
- Harness/tool-policy blocks are not BrowserHost failures without direct evidence.

## Branch and PR relationship

This planning PR remains documentation-only and intentionally starts from `main`.

It does **not** reconcile, push or overwrite the local `fix/electron-native-liveness` implementation lineage. Local checkpoint `10155028925c1919f6c346f76802e1acad547030` is a planning reference, not a commit on this documentation branch.

PR #31 remains open as the chronological incident/evidence ledger. Its older body is historical context and must not override this current planning document or the newer timestamped evidence comments.

PR #32 remains the dedicated CGW-010 design/evidence stream and resumes only when the current manual ChatGPT-Web path is sufficiently stable or evidence directly calls for that work.

Before eventual final merge/closeout of the reliability workstream, deliberately reconcile local implementation history with remote PR history, preserve protected local scripts/intentional state, verify exact final HEAD, update canonical statuses from actual evidence, and leave merge/close decisions to the human operator.
