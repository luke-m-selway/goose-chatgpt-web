# CGW foundation-first implementation plan — 2026-08-21

## Purpose

This document is the current implementation-order authority for the `goose-chatgpt-web` reliability workstream.

It replaces the stale execution ordering in draft PR #31 without discarding PR #31's incident history. PR #31 remains the chronological evidence/forensics ledger; this document defines what should be implemented and requalified next, and in what dependency order.

The objective is to stabilise the lowest-level correctness contracts first so higher-level continuation, large-context and concurrency qualification are not repeatedly invalidated by later changes to foundational browser/provider semantics.

## Current runtime checkpoint

The currently activated local development runtime is:

`38de8c0e9773210f54f6a32a965251e6f3f43bb5`

Activation and one ordinary non-Goose-Control ChatGPT-Web/high smoke passed on 2026-08-21:

- daemon, BrowserHost and tunnel restarted canonically with one owned instance each;
- BrowserHost authenticated and runtime observation enabled;
- Goose session `20260821_9`, ChatGPT trace `856fd7eb9e92`;
- one harmless Goose Native `pwd` tool round completed;
- final assistant result persisted;
- runtime returned to `active_http_turns=0`, `active_browser_turns=0`.

`38de8c0` is therefore the ecological-use checkpoint while the remaining foundations are repaired. It is a local checkpoint and must not be inferred from the stale remote PR #31 head.

## Architecture invariants

Do not change these without new contradictory evidence:

1. Goose owns durable logical session/history, tools, orchestration, cancellation and context lifecycle.
2. A genuinely new human turn gets a fresh provider execution and fresh ChatGPT Temporary Chat.
3. Exact transport retries and tool-result rounds of the same owning turn may retain that turn's execution identity.
4. Prompt-content equality is not an idempotency contract.
5. Independently owned Goose operations may overlap under one `agent-session-id`; do not serialize by Goose session identity.
6. Browser/Temporary-Chat state is disposable and must not become canonical conversation state.
7. Electron/BrowserHost native lifecycle evidence outranks DOM/Playwright symptoms for renderer/surface liveness.
8. Passive observability must never acquire request-blocking authority. Electron `webRequest` observers must continue intercepted requests.
9. Do not solve liveness failures by casually increasing the existing 40s composer, 45s helper-silence, 60s orphan or 5s BrowserHost/control budgets.
10. Keep the current Goose → Responses daemon → Electron BrowserHost → Node helper + Playwright/CDP topology unless substantially stronger evidence requires redesign.

## Corrected interpretation of continuation and duplicate surfaces

Do not treat historical two-surface observations as proof of a same-session continuation-state defect.

At the current checkpoint, source and passive evidence show that the strongest recorded duplicate-surface pairs were legitimate Goose-owned concurrency: the ordinary provider request overlapped background `complete_fast` tool-pair summarisation under the same `agent-session-id`, with distinct execution keys and retry lineages.

The continuation identity contract is therefore not the current repair target. Do not add an `agent-session-id` mutex, one-surface rule, supersession rule or continuation-specific serialization.

The remaining continuation-adjacent failures are lower-level send/completion/streaming failures that must be repaired first and then requalified through an ordinary second human turn.

## Current status snapshot

### Resolved / observe

- **CGW-001 — Goose Native connector activation:** full configured mention selection, catalog filtering, rerender recovery and positive connector verification are implemented and live-proven.
- **CGW-002 — content-keyed execution identity:** fixed and live-qualified. Separate Goose sessions with byte-identical prompts receive distinct provider execution identities; same-turn tool continuation remains stable.
- **CGW-003 — transient pre-lease failure replay:** repaired so transient BrowserHost availability failures do not poison a settled exact-key entry for the registry TTL.
- **CGW-004 — duplicate surfaces interpreted as same-session defect:** strongest cases are now classified as legitimate Goose-owned concurrency, not a defect requiring session serialization.
- **CGW-005 — runtime recovery mechanism:** supported `cancel-turns` recovery is implemented and repeatedly proven operationally; the reusable recovery skill should receive its final ecological qualification only on the next genuine retained-turn incident rather than via a manufactured failure.
- **Connector/menu timeout-accounting and shared-helper sibling containment:** repaired and deterministically covered.
- **Bounded native liveness architecture:** per-surface native generation evidence, heartbeat retire/replace, generation-aware orphan reaping and bounded turn lifetime are present in the local lineage.
- **Critical hydration regression:** fixed by restoring mandatory `webRequest` request continuation.

### Open / active

- **CGW-009 — send acknowledgement indeterminacy:** ChatGPT may accept/start a prompt while Playwright `sendButton.press("Enter")` remains unresolved and later times out. A safe fix requires an authoritative native signal for the exact owned submission, or an explicit indeterminate-after-dispatch state that prohibits automatic resubmission.
- **Completion/terminal interpretation — Incident B:** native generation can settle, broker/tool work can be complete and the surface remain responsive while the current sole accepted terminal action (`copy-turn-action-button`) is absent. `38de8c0` now captures decision-grade screenshot/control/native-generation/broker evidence on the next natural recurrence. Do not broaden completion semantics without that evidence.
- **Semantic stream mutation:** a long single-agent session failed because ChatGPT changed/resegmented text already treated as completed and streamed outward. Transcript correctness must remain fail-closed, but the bridge needs a semantic strategy that tolerates legitimate DOM rerender/resegmentation without silently corrupting output.
- **CGW-017 — live-but-no-progress DOM/control stall:** the original defect was real, but later native-liveness work materially changed its failure envelope. It requires explicit current-HEAD reconciliation before it can be called closed.
- **CGW-007 / Incident A — broker responsiveness:** recovered failure is a five-second broker `claim` response timeout before child-B provider/browser creation. `38de8c0` now reports broker method and response phase; the broker-internal cause remains open.
- **CGW-006 — ~600s healthy-stream abort:** root cause is proven in Goose's OpenAI provider absolute reqwest request lifetime. The correct repair belongs in the streaming transport policy, not BrowserHost timeouts.
- **CGW-010 — large-context context-feed:** implemented and partially live-proven, but not fully qualified end-to-end.
- **CGW-013 — routine verification launches browser work:** ordinary `bun run verify` still needs to be made deterministic/browser-free, with managed-Chrome/browser compatibility smoke moved behind an explicit deliberate command.
- **CGW-014 — parent + two ChatGPT-Web children:** topology and reliable completion were proven on earlier checkpoints, including 102.646s genuine three-way overlap at `c8876d6`, but current-HEAD requalification is required after the subsequent foundational changes.

## Foundation-first implementation order

The following order is normative unless new evidence proves a dependency is wrong.

### Gate 1 — establish exact-once submission semantics (CGW-009)

First determine and, if evidence permits, implement the smallest authoritative submission-acceptance contract.

Required invariant:

- if ChatGPT has accepted the exact owned submission, a stalled Playwright Enter acknowledgement must never trigger a second Enter;
- if submission genuinely did not occur, the original causal failure must remain visible;
- weak correlation such as generic navigation, renderer activity or generation-like UI changes must not be promoted to acceptance authority without proof.

Prefer an already-existing Electron/BrowserHost/native signal. If none is specific enough, add only the smallest additional native event required.

Do not proceed to qualification-heavy work while this contract remains ambiguous.

### Gate 2 — stabilise output and completion semantics

Resolve or decisively classify the two single-agent post-send correctness failures:

1. generation settled but the expected completion action was absent (Incident B);
2. ChatGPT rerendered/resegmented text already emitted as completed (`ChatGPT changed a completed text block that was already streamed to Codex`).

The implementation must preserve transcript correctness. Do not simply weaken mutation/corruption guards or accept arbitrary stable text as completion.

Use semantic/structural reconciliation where possible rather than DOM-node identity as a durable output identity.

Incident B should be fixed only when the activated `38de8c0` evidence from a natural recurrence is sufficient to distinguish a valid settled post-tool terminal state from a parked/incomplete tool round.

### Gate 3 — reconcile CGW-017 with the current native-liveness model

Review the original live-but-no-progress failure against the later native-generation, heartbeat replacement, generation-aware orphan and absolute-lifetime semantics.

Conclude one of:

- fixed by the newer architecture and deterministically covered;
- partially fixed with one remaining invariant;
- still open with a current reproduction/evidence requirement.

Do not retain a stale CGW-017 status merely because its original implementation predates the current architecture.

### Gate 4 — make the verification harness hermetic (CGW-013)

Before the next major qualification cycle, make ordinary `bun run verify` deterministic and browser-free.

Requirements:

- unit/contract/type/build/release-smoke verification must not create headed managed-Chrome/browser state by default;
- retain managed-Chrome/browser compatibility testing behind an explicit deliberate qualification/CI/release command;
- preserve the support contract rather than silently deleting compatibility coverage.

This is infrastructure hygiene for all subsequent reliability work: the test harness must not perturb the browser system it is validating unless explicitly requested.

### Gate 5 — finish broker admission/responsiveness semantics (CGW-007 / Incident A)

Use the new broker method/phase evidence on any natural recurrence. If the recovered condition repeats as `method=claim, phase=response-start`, localize why the broker socket connected and the request was written but no complete response began within the existing five-second control boundary.

Do not classify parent+2 failures as BrowserHost-capacity failures while child creation can still fail before provider/browser creation at this broker boundary.

Do not increase the five-second broker deadline or add blind retries as the first repair.

### Gate 6 — repair Goose's streaming lifetime semantics (CGW-006)

Patch the owning Goose OpenAI/Responses streaming transport so healthy streaming bodies are not killed by an absolute total-request deadline.

Preferred contract:

- no absolute total response-body lifetime deadline for streaming Responses;
- explicit caller cancellation remains authoritative;
- connection/setup bounds may remain;
- if a stalled-stream bound is needed, it must be a genuine inactivity/read policy that resets after successful reads;
- non-streaming timeout semantics remain unchanged;
- preserve underlying reqwest/network error causality.

Proof must be hermetic and scaled with a local SSE server; do not use a 600-second wall-clock ChatGPT test.

This gate must be complete before long-duration orchestration is considered qualified, even though it is independent of the current short send/completion defects.

### Gate 7 — current-HEAD single-agent qualification

Once Gates 1–6 that affect the ordinary provider path are stable, run the smallest useful qualification sequence:

1. fresh ordinary ChatGPT-Web/high turn;
2. harmless Goose Native tool round;
3. final assistant completion;
4. a genuine second human turn in the same Goose session;
5. another useful bounded tool/completion round;
6. clean settlement to `active_http_turns=0`, `active_browser_turns=0`.

This is the point where ChatGPT-Web continuation can again be called operationally qualified. The test is not looking for browser-state reuse; it proves that fresh per-turn provider execution works reliably while Goose-owned history is replayed.

### Gate 8 — finish CGW-010 large-context qualification

Do not redesign CGW-010 before completing the lower-level gates.

Existing live evidence already proves the core feed mechanics:

- one real context feed installed;
- 19,684 UTF-16 characters loaded as `0→16000→19684`;
- final `eof=true` before normal task tools;
- useful post-EOF work occurred.

Remaining qualification should prove clean turn settlement, dependent later continuation using earlier-session facts, and a small inline control. Then stage useful parent+1, parent+2 and Goose-Control-path evidence rather than manufacturing context padding.

### Gate 9 — concurrency requalification

Only after the single-agent path and broker foundation are sound:

1. manual/ordinary parent + 1 ChatGPT-Web child;
2. Goose-Control-started parent + 1;
3. current-HEAD parent + 2.

Parent+2 is a regression qualification, not an architecture experiment: the topology is already proven viable. Preserve one-parent-plus-two-child as the target normal maximum; parent+3 remains rare/non-gating research.

A concurrency failure must first be classified against submission, completion, liveness, broker and Goose-streaming foundations before changing the concurrency architecture.

### Gate 10 — Goose Control route repeatability

Goose Control is the orchestration/control plane, not a BrowserHost owner. Qualify it after the ordinary Goose provider path is stable so GC failures are not confounded with provider foundations.

Required progression:

- repeated fresh GC-started ChatGPT-Web first turns without retry;
- GC parent+1 after ordinary parent+1 passes;
- GC parent+2 only after current-HEAD ordinary parent+2 passes.

Keep Day Shift/Goose-Control ACP/session-list defects separate from ChatGPT-Web BrowserHost failures.

## Deferred / non-gating work

Do not interrupt the foundation sequence for these unless new evidence makes one causal:

- CGW-005 final ecological recovery-skill qualification;
- CGW-008 ChatGPT-native `Connection interrupted` observation;
- CGW-011 provider-demand BrowserHost/lifecycle design;
- CGW-012 actual macOS reboot/login reconstruction proof;
- parent+3/stress testing;
- Electron/helper RAM/resource-efficiency attribution;
- larger Opus simplification backlog such as event-driven DOM observation or renderer-independent surface metadata;
- broad topology redesign;
- PR #32 architectural redesign beyond the already-implemented context-feed candidate.

## Agent and cost-routing policy for this workstream

Use the cheapest model that preserves correctness:

1. **ChatGPT-Web fresh session** — source reading, passive evidence reconstruction, design/scoping, semantic review, deterministic test planning. ChatGPT-Web continuation is not assumed operationally qualified until Gate 7 passes.
2. **Codex GPT-5.6 Luna / Low** — default implementation, focused tests, mechanical validation, activation procedure when bounded.
3. **Terra / Medium** — only when implementation still requires meaningful judgment across interacting paths after ChatGPT-Web scoping.
4. **Sol / Medium** — exceptional difficult/open-ended implementation where the lower tiers are insufficient.
5. **Claude/Sonnet/Opus** — independent cross-family review or rescue only when materially justified; Codex is not a cross-family de-anchoring step for ChatGPT/Codex reasoning.

Avoid Fast mode by default when conserving Codex quota.

## Qualification discipline

- Prefer natural useful/ecological workloads after deterministic coverage is in place.
- Do not manufacture Incident B, retained-turn spinout or rare watchdog branches merely to collect evidence.
- Do not retry a failing qualification until its failure is classified; one unclassified retry can destroy causal evidence.
- Keep one exact acceptance criterion per gate.
- A higher-level pass is not final if a lower-level foundation later changes materially; requalify only the dependent layers affected by that change.
- Preserve negative controls, failure causality and privacy-safe telemetry.
- Do not treat harness/OpenAI safety-policy blocks as BrowserHost failures without direct evidence.

## Branch and PR relationship

This planning PR intentionally starts from current `main` and contains documentation only.

It does **not** reconcile or overwrite the materially advanced local `fix/electron-native-liveness` lineage, and it does not imply that local checkpoints such as `38de8c0` exist on this remote branch.

PR #31 should remain open as the chronological incident/evidence ledger until deliberate branch reconciliation. Its stale body/order should no longer be used as the current implementation plan; link future status updates back to this document.

PR #32 remains the dedicated CGW-010 design/evidence stream and should follow Gate 8 rather than driving lower-level BrowserHost fixes.

Before final merge/closeout of the reliability workstream:

1. reconcile the local implementation lineage and remote PR history deliberately;
2. preserve protected local scripts and intentional working-tree state;
3. run exact-final-HEAD verification after all required gates;
4. update canonical CGW statuses from actual qualification evidence;
5. only then make the human draft-ready/merge/close decision.
