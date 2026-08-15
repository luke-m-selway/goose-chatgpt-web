# ChatGPT-Web hardening plan

Status: **canonical planning / diagnosis register**  
Updated: **2026-08-15**  
Primary runtime workstream: **PR #31 — `fix/electron-native-liveness`**  
Related design tracks: **PR #32 — large-context continuation**, **PR #33 — provider-demand BrowserHost lifecycle**

This document is the canonical evidence-driven hardening register for the current ChatGPT-Web provider. It separates diagnosis, bounded experiments, implementation, activation, and proof. It does not authorize broad retries, larger timeout budgets, lifecycle redesign, or provider-specific recovery in Goose Control.

## 1. Current state

### Repository / deployed source reconciliation

- Local branch: `fix/electron-native-liveness`.
- Local HEAD: `a98ab0d342623a562ca71a847aa3ebf6d3dd3032` — `fix(chatgpt-web): resolve connector mention by full name, not first letter`.
- PR #31 remote head: the same `a98ab0d...` revision.
- Worktree at reconnaissance start: no tracked modifications; only the protected pre-existing untracked files `scripts/open-manual-browser.ts` and `scripts/proof-mcp-server.ts`.
- The current daemon launchd definition runs `/Users/luke/Documents/goose-chatgpt-web/src/cli.ts serve` through this worktree's Bun.
- The current BrowserHost process runs Electron from `/Users/luke/Documents/goose-chatgpt-web/launcher`; its descriptor points at this worktree's `.launcher-runtime/browser-helper.cjs`.
- Current daemon / BrowserHost processes were started on 2026-08-15 at approximately 23:29 CEST. The latest passive connector proof trace `5acef0a21af2` began at `2026-08-15T21:31:01Z`, leased one launcher surface, selected/sent successfully, performed one Goose Native `shell` call, and completed cleanly.
- Therefore the runtime currently in use is sourced from the PR #31 worktree at the current head, not merely the older documented `7f99f187...` checkpoint. Older PR prose remains historical evidence only.

### Canonical log locations, derived from source / plists

- Responses daemon stdout: `/Users/luke/.goose-chatgpt-web-dev/logs/daemon.stdout.log`.
- Responses daemon stderr: `/Users/luke/.goose-chatgpt-web-dev/logs/daemon.stderr.log`.
- Secure MCP Tunnel stdout: `/Users/luke/.goose-chatgpt-web-dev/logs/tunnel.stdout.log`.
- Secure MCP Tunnel stderr: `/Users/luke/.goose-chatgpt-web-dev/logs/tunnel.stderr.log`.
- Electron launcher structured log on macOS: `~/Library/Logs/Codex Web GPT/launcher.jsonl` (`launcher/electron/main.cjs` and qualification source agree on this location).
- Passive recorder root: `/Users/luke/.goose-chatgpt-web-dev/observations`.

### Passive corpus at this checkpoint

The aggregate recorder index contains 100 finalized traces and 104 trace summaries:

- 51 completed, 46 failed, 3 aborted.
- 97 Responses bodies ended with normal close; 3 were client cancellations. No finalized trace records a daemon-side body decode error.
- Maximum simultaneous browser turns per trace: 73 observed at 1, 22 at 2, 5 at 3.
- Error classifications: 36 generic `Error`, 8 `TimeoutError`, 3 `AbortError`, 2 `chatgpt_browser_control_unresponsive`, 51 none.
- Three traces ended with unresolved broker calls (`08bc98d182c3`, `8c2d5b396afa`, `690de65faf27`); only `08bc...` and `690...` also failed.
- The recorder contains 70 `retry-failure` and 65 `retry-circuit-open` events, but the duplicate-surface cases examined below are distinct execution keys/lineages, not exact-key retry replacements.

The daemon logs can be joined to 99/100 indexed traces with privacy-safe compiled prompt-size telemetry. Important correlation, not causation:

- Largest completed inline prompt in this corpus: 49,174 chars.
- One 143,988-char trace was aborted by client cancellation.
- All 3 traces in 150k–350k chars failed.
- All 7 traces above 471k chars failed; every one also observed browser concurrency (`maximumActiveBrowserTurns > 1`).
- The large prompts do **not** show a simple prompt-attachment-duration law: among successful attachment stages, the smallest and largest prompt-size quartiles have similar median attachment durations, while failures occur in connector selection, send/control, and concurrent lifecycle paths as well as attachment itself.

This supports PR #32's large-context concern as a strong correlated risk, but not yet as a diagnosed transport root cause.

### Architecture / proof boundaries retained

- Goose owns logical conversation/session/context/tool/delegation state.
- ChatGPT-Web is a provider transport beneath Goose.
- Responses daemon and Secure MCP Tunnel are independently supervised.
- Electron owns BrowserHost only.
- Goose Control stays provider-agnostic and must not absorb ChatGPT-Web recovery.
- Canonical lifecycle remains `tunnel ready -> BrowserHost genuinely ready -> Responses daemon ready`, with reverse stop order.
- BrowserHost readiness is the descriptor-provided helper under Node/Electron Node semantics with `ELECTRON_RUN_AS_NODE=1`; Bun-direct Playwright/CDP is not authoritative readiness proof.
- Actual reboot/login reconstruction remains **NOT RUN**.
- Parent + two ChatGPT-Web children / three-surface overlap is established; reliable parent + two-child completion remains **NOT QUALIFIED**.

## 2. Canonical issue register

### CGW-001 — Goose Native connector mention activation

- **Class:** fixed-observe
- **Final classification:** FIXED / OBSERVE
- **User impact:** turns failed before prompt submission because the connector menu did not expose/select the required `Goose Native` row; failures could then participate in retained-surface recovery churn.
- **Frequency / severity:** recurrent on 2026-08-15 before the repair; high severity for tool-capable turns.
- **Exact supporting evidence:** PR #31 discussion; `docs/chatgpt-web-connector-mention-activation.md`; pre-fix traces including `593bce2bf164`, `b8bedb8a937a`, `3f53f4cce9ba`, `43df7096a128`, `19b75c17567a`, `9f1aeca02116`. `9f1...` records a 20.5s `prompt_attachment` failure with a polluted menu and no `Goose Native` row. Post-fix `5acef0a21af2` completes selection, send, a Goose Native shell call, and final response.
- **Current root-cause confidence:** high for the repaired recurrence.
- **Known facts:** short `@g` activation could expose unrelated sidebar/menu rows; candidate discovery admitted `[data-sidebar-item]`; the menu can detach/rerender.
- **Unknowns:** only whether a materially different future ChatGPT UI regression appears.
- **Overlap / dependency:** connector failures can trigger CGW-004/CGW-005 recovery symptoms, but are not their root cause.
- **Current implementation / fix status:** repaired by `a98ab0d...`: type full configured mention, exclude `[data-sidebar-item]`, retain exact-name matching, detach/rerender recovery, and mandatory `connectorIsSelected()` verification.
- **Activated runtime contains relevant repair:** YES.
- **Can existing evidence fully specify a fix?** NO; none warranted without regression.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** retain the focused browser-worker cases for full-name typing, polluted-row exclusion, exact unique match, rerender recovery, and selected-state verification.
- **Out-of-band runtime testing required:** NO now.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** observe only; reopen only with a post-`a98ab0d` trace that violates the repaired contract.

### CGW-002 — Standalone execution identity is content-derived across fresh Goose sessions

- **Class:** confirmed-defect
- **Final classification:** READY-FOR-FIX
- **User impact:** two genuinely fresh Goose chats that send the same normalized prompt can be treated as one ChatGPT-Web execution. A settled success/error can be replayed into the wrong logical Goose session without opening a browser surface.
- **Frequency / severity:** deterministic when normalized request content collides; severe because it breaks execution identity and contaminates later diagnosis.
- **Exact supporting evidence:** `docs/chatgpt-web-ecological-supplement-2026-08-14.md`; PR #31 discussion; passive trace `55d7c2bed175` was reused by agent sessions `20260814_28`, `_29`, `_30`, `_31`, `_32`, `_35`, `_36` with the same execution-key hash and no new browser lease on later requests; distinct prompt/session `_34` used trace `70b87737e109`, leased a surface, and completed. Source: `src/server.ts` `tagStandaloneIdentity()` computes `standalone_<sha256(normalized input prefix)>` and `responseRequest()` does not namespace this synthetic identity with the already-trusted `agent-session-id` header. `tests/server-standalone.test.ts` currently encodes byte-identical content reuse without distinguishing client session scope.
- **Current root-cause confidence:** high.
- **Known facts:** exact HTTP retries and tool-result rounds within one logical Goose execution must remain idempotent; fresh Goose sessions must not collide merely because prompt text is equal; volatile `<turn-context>` remains intentionally excluded.
- **Unknowns:** none material to the narrow repair.
- **Overlap / dependency:** explains the cross-session stale replay portion of execution-identity incidents. It is distinct from CGW-003 (a transient error being retained within a legitimate exact execution) and should be fixed first because it contaminates evidence for all later work.
- **Current implementation / fix status:** not fixed at `a98ab0d`.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence fully specify a fix?** YES.
- **Smallest proposed repair:** add an optional trusted standalone identity namespace derived from `agent-session-id`; compute the synthetic identity from `(trusted session namespace, normalized standalone identity prefix)` when that header is present. Do **not** use `agent-session-id` alone, because multiple user turns within one Goose session must remain distinct. Preserve the current content-only digest as the compatibility fallback for standalone clients that supply no session header.
- **Required deterministic regression tests:** (1) same normalized body + different `agent-session-id` => different synthetic turn/execution keys; (2) same normalized body + same `agent-session-id` => same key; (3) same session + tool-result continuation for the same turn => same key; (4) same session + new latest user message => different key; (5) volatile `<turn-context>` differences remain ignored; (6) no-header compatibility retains current byte-identical retry collapse.
- **Out-of-band runtime testing required:** NO before implementation. Activation proof should later use two fresh ordinary Goose sessions with intentionally identical prompt text and verify distinct trace IDs/surfaces.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** first implementation packet in this plan.

### CGW-003 — Pre-lease launcher availability failures can poison exact-key settled replay

- **Class:** confirmed-defect
- **Final classification:** READY-FOR-FIX
- **User impact:** a transient BrowserHost descriptor/readiness failure can settle as a generic non-retryable error and remain cached for the exact execution key, so a later legitimate retry can replay the old error after BrowserHost health has returned.
- **Frequency / severity:** confirmed in the 2026-08-14 recovery sequence; severe when it occurs because healthy runtime restoration does not clear the logical execution's cached failure.
- **Exact supporting evidence:** ecological supplement records `Launcher browser host is unavailable: descriptor is missing ...`; passive `55d7c2bed175` shows immediate failure without a surface lease followed by repeated same-key failures after runtime restoration, while fresh `70b87737e109` leased and succeeded. Source: `src/launcher-browser-host.ts` emits plain `Error` for missing/stale/invalid descriptor/process/readiness conditions. `src/adapters/chatgpt-web/index.ts` only retires a turn session automatically when the thrown value is a retryable `ChatGptWebAdapterError`; generic errors are cancelled but remain eligible for settled replay. The retry circuit treats unclassified generic errors as terminal/open.
- **Current root-cause confidence:** high for the stale replay mechanism; the exact first missing-descriptor event is documented rather than body-recorded because the recorder intentionally stores no request body.
- **Known facts:** launcher absence before a lease is an infrastructure availability failure, not a model/user error; bounded retry circuit already limits retryable failures to one recovery browser attempt.
- **Unknowns:** which narrow set of launcher pre-lease failures should share one public error code; this is an implementation naming choice, not a behavioral uncertainty.
- **Overlap / dependency:** CGW-002 lets this poison cross fresh sessions; after CGW-002 it can still poison an exact legitimate retry within one session, so it remains independently real.
- **Current implementation / fix status:** not fixed at `a98ab0d`.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence fully specify a fix?** YES.
- **Smallest proposed repair:** at the launcher-helper/adapter boundary, wrap the explicit pre-lease BrowserHost-unavailable/readiness family in a structured `ChatGptWebAdapterError` such as `chatgpt_browser_host_unavailable`, `retryable: true`, preserving the original causal message/cause. Reuse the existing retryable-session retirement path; do not broadly reinterpret arbitrary browser/UI errors and do not enlarge retry budgets.
- **Required deterministic regression tests:** fake first pre-lease descriptor-unavailable error then success; verify the exact-key session is retired and the second request starts a fresh runtime. Verify two consecutive failures consume only the existing bounded retry budget and then open the circuit. Verify unrelated generic/non-retryable errors remain settled/replayed as before. Verify original launcher error text is preserved.
- **Out-of-band runtime testing required:** NO before implementation; later activation proof may stop at passive observation of a natural recovery, rather than deliberately removing the active descriptor.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** implement after CGW-002.

### CGW-004 — Same-Goose-session distinct executions can overlap and amplify failure surfaces

- **Class:** likely-defect
- **Final classification:** NEEDS-OUT-OF-BAND-TEST; MUST RETURN TO FRESH PLANNER
- **User impact:** one Goose session can have multiple independently admitted BrowserHost surfaces. When one path fails, later requests can open additional surfaces while an earlier path is still alive, producing duplicate windows, retained active turns, repeated close/reopen behavior, and difficult-to-interpret recovery.
- **Frequency / severity:** multiple natural incidents; severe because it multiplies side effects and contaminates later failure evidence.
- **Exact supporting evidence:** `docs/chatgpt-web-network-error-retry-lineage-evidence.md`, runtime-recovery skill plan, PR #31 comments, passive traces. Strong examples: `e33c7b505cba` and `4048d843a134` share agent session `20260814_42`, distinct execution keys and retry lineages, and were admitted 15ms apart; both leased surfaces. `43df7096a128` and `baf97a863c1b` share `20260815_18`, distinct keys/lineages and were admitted ~241ms apart; while `43df...` remained live, `68aa6355880d` started another distinct execution and succeeded. `7926414d69a8` and `feae22156c7d` similarly started ~26ms apart under `20260814_37`. These are **not** `retry-replacement-linked` exact-key retries.
- **Current root-cause confidence:** high that concurrent same-session distinct executions exist; medium on why Goose emitted each pair.
- **Known facts:** the strongest pairs are highly asymmetric in compiled prompt size: `e33...` ~578.5k chars vs `4048...` ~5.9k; `43df...` ~564.5k vs `baf...` ~6.3k and then `68aa...` ~8.5k. Current source recognizes stock Goose compaction separately and contains a deterministic 592k-character / roughly 160k-token compaction regression. This makes compaction/main-turn overlap the leading hypothesis, not a proven fact.
- **Unknowns:** whether each observed large member is actually `_gooseCompactionRequest`; whether stock Goose intentionally overlaps compaction and the following ordinary request; whether an occasional other `complete_fast()` purpose is involved; which layer should serialize or supersede an older browser execution.
- **Overlap / dependency:** many symptoms previously called “retry amplification” map here, but CGW-002/003 can independently cause replay. CGW-010 large-context risk can make the large member slower/more failure-prone. CGW-005 is recovery only.
- **Current implementation / fix status:** no safe generic fix yet. A per-`agent-session-id` global mutex is explicitly **not** justified: it could serialize legitimate protocol work or deadlock compaction/tool continuation.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A until request purpose is discriminated.
- **Required deterministic regression tests:** once diagnosed, tests must encode the proven request-purpose relationship first; likely tests will ensure a superseded compaction cannot own a second active BrowserHost surface while the same Goose turn continues, without blocking distinct child agent sessions or valid exact-key continuation.
- **Out-of-band runtime testing required:** YES, bounded packet OOB-004 below.
- **Correct PR/workstream:** PR #31 for settlement/admission if provider-side; PR #32 only if the result shows the large-context transport itself is causal. Do not merge the tracks pre-emptively.
- **Recommended next action:** run OOB-004 only after CGW-002/003 are implemented and activated, then return evidence to a fresh ChatGPT-Web planner.

### CGW-005 — Supported retained-turn recovery is operationally proven but not yet packaged as a skill

- **Class:** operational
- **Final classification:** READY-FOR-FIX
- **User impact:** after a retained-turn/replacement-surface spinout, an operator or fresh repair agent can waste time rediscovering safe recovery or escalate to broad process restarts/kills unnecessarily.
- **Frequency / severity:** repeated enough to have two documented incidents; recovery itself is reliable and low risk when used for the correct trigger.
- **Exact supporting evidence:** `docs/chatgpt-web-runtime-recovery-skill-plan.md`; PR #31 comments document `codex-chatgpt-web service cancel-turns` returning the runtime to clean idle state after retained-turn spinout. Current plan explicitly separates recovery from diagnosis and forbids ad-hoc process kills when supported cancellation succeeds.
- **Current root-cause confidence:** high for the operational procedure; it is not a diagnosis of why spinout happened.
- **Known facts:** recovery must inspect minimal state, preserve the triggering trace/error, invoke supported cancellation only when retained-turn spinout is established, verify clean idle, and avoid service restart if cancellation succeeds.
- **Unknowns:** none material; skill discovery wiring should be reconciled with the current repo agent-skill convention during implementation.
- **Overlap / dependency:** operational safety net for CGW-004/CGW-009 and future UI failures; must never be treated as their fix.
- **Current implementation / fix status:** design complete, implementation absent.
- **Activated runtime contains relevant repair:** N/A; this is an agent procedure.
- **Can existing evidence fully specify a fix?** YES.
- **Smallest proposed repair:** add `.agents/skills/chatgpt-web-runtime-recovery/SKILL.md` from the existing plan and one short `AGENTS.md` activation rule. Do not add a new orchestration service/framework.
- **Required deterministic regression tests:** if skill discovery is automated, add the smallest discovery/schema test; otherwise validate file structure/content and current CLI command names without invoking cancellation.
- **Out-of-band runtime testing required:** NO for implementation. A later real incident can serve as ecological validation.
- **Correct PR/workstream:** PR #31 operational hardening or a tightly scoped follow-up.
- **Recommended next action:** implement after the identity/settlement fixes or before any later destructive experiment, whichever comes first.

### CGW-006 — Outer Responses caller cancels active streams at approximately 600 seconds

- **Class:** likely-defect
- **Final classification:** NEEDS-OUT-OF-BAND-TEST; MUST RETURN TO FRESH PLANNER
- **User impact:** Goose can report a network/stream decode failure while the BrowserHost/model turn is still alive and useful work has been progressing, orphaning the result and encouraging a new provider attempt.
- **Frequency / severity:** at least three client-cancelled finalized traces in the current corpus; historical reports cluster near 603–606 seconds. Severe on long turns.
- **Exact supporting evidence:** `docs/chatgpt-web-network-error-retry-lineage-evidence.md`; passive trace `4c995549362e` records request signal abort/client cancellation at ~599.9s while the BrowserHost turn continued to ~1,270.6s; trace `022984c74576` records a request signal abort at ~600.0s during a much longer browser/tool turn. Recorder aggregate has 97 normal body closes and 3 client cancellations, with **no** finalized daemon-side `body-error`. BrowserHost heartbeats continue up to the cancellation boundary. `src/server.ts` records the request's `AbortSignal` and propagates caller cancellation to the adapter.
- **Current root-cause confidence:** high that the daemon is being cancelled by its caller around 600s; low on the exact layer producing the user-visible “Stream decode error” and whether that layer is Goose's HTTP client, a provider wrapper, or another outer transport component.
- **Known facts:** SSE heartbeat activity does not prevent this approximately total-duration boundary. Increasing ChatGPT/browser stage timeouts would not address it.
- **Unknowns:** exact owner/configuration of the ~600s deadline and the correct contract for turns that can legitimately stay in one Responses stream longer than it.
- **Overlap / dependency:** can trigger CGW-004 amplification when Goose starts a later request while the browser attempt remains useful/alive. Distinct from BrowserHost liveness.
- **Current implementation / fix status:** not fixed in this repo; fix placement not yet established.
- **Activated runtime contains relevant repair:** NO known repair.
- **Can existing evidence fully specify a fix?** NO. Do not globally raise timeout/retry budgets.
- **Smallest proposed repair if YES:** N/A until owner is identified.
- **Required deterministic regression tests:** once owner is known, local mock Responses stream with continuous SSE activity across the discovered deadline; verify intended caller behavior and causal error preservation without touching ChatGPT.
- **Out-of-band runtime testing required:** YES, but it can be completely out-of-band from ChatGPT-Web BrowserHost; packet OOB-006 below.
- **Correct PR/workstream:** likely Goose/provider-client boundary unless the experiment proves a repo-local transport bug. Keep out of Goose Control.
- **Recommended next action:** source-inspect the active Goose HTTP provider deadline, then use a local heartbeat mock only if source inspection is inconclusive; return result to a fresh planner before changing behavior.

### CGW-007 — Broker timeout/orphan/revocation observations lack one clean current root cause

- **Class:** hardening
- **Final classification:** WATCH / ECOLOGICAL
- **User impact:** a tool-capable turn can lose its clean final continuation if broker claim/invoke/result state outlives or loses its owning Responses request; user may see broker timeout or an orphaned tool turn.
- **Frequency / severity:** sporadic; high impact when it prevents final settlement, but current evidence is confounded by larger failed/aborted turns.
- **Exact supporting evidence:** PR #31 ecological comments; passive `08bc98d182c3` ended failed with 3 unresolved broker calls then recorded broker revocation; `690de65faf27` ended failed with 1 unresolved call; `8c2d5b396afa` completed while summary still reports one unresolved snapshot. Tunnel logs contain repeated `response already fulfilled or unknown request` warnings around failed epochs. Source: broker invocations use the turn's expiry or unbounded lifetime; local `claim` still uses the bounded 5s default, and revocation explicitly rejects pending invocations.
- **Current root-cause confidence:** low-to-medium. No current log line contains the exact `ChatGPT web turn broker timed out` message, so the historical timeout cannot yet be assigned to claim latency, invocation lifetime, tunnel response duplication, or a parent cancellation.
- **Known facts:** revocation on turn end is intentional; unresolved-at-summary does not alone prove a leak; increasing broker timeout globally is not justified.
- **Unknowns:** exact phase of the historical timeout and whether current code still reproduces it naturally.
- **Overlap / dependency:** CGW-006 cancellation and CGW-004 surface/turn overlap can strand broker state; tunnel duplicate-response warnings may be consequences rather than root causes.
- **Current implementation / fix status:** no change warranted now.
- **Activated runtime contains relevant repair:** current bounded broker lifecycle/revocation code is active.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** none until a root cause is isolated.
- **Out-of-band runtime testing required:** NO yet; do not manufacture a broker timeout. On the next natural exact timeout, capture trace, phase (`claim`/`invoke`/`resolve`), token binding lifetime, parent Responses outcome, and tunnel request IDs.
- **Correct PR/workstream:** PR #31 only if a provider/broker defect is proven.
- **Recommended next action:** watch/ecological.

### CGW-008 — ChatGPT-native “Connection interrupted” remains an ecological symptom, not a diagnosed defect

- **Class:** hardening
- **Final classification:** WATCH / ECOLOGICAL
- **User impact:** ChatGPT UI can display `Connection interrupted. Waiting for the complete answer`, potentially followed by navigation/reset/replacement behavior.
- **Frequency / severity:** historical/occasional; no corresponding finalized event in the current indexed corpus.
- **Exact supporting evidence:** PR #31 reliability notes. Current recorder aggregate reports `transientConnectionInterrupted = 0` across the 100 indexed traces.
- **Current root-cause confidence:** low.
- **Known facts:** absence in the current corpus means it should not be conflated with CGW-006's caller cancellation or CGW-009's send acknowledgement.
- **Unknowns:** whether it is remote ChatGPT network recovery, page navigation, surface replacement, or another cause.
- **Overlap / dependency:** no proven dependency.
- **Current implementation / fix status:** no specific repair.
- **Activated runtime contains relevant repair:** N/A.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** none until a clean trace exists.
- **Out-of-band runtime testing required:** NO now; wait for a naturally captured trace with the native interruption telemetry.
- **Correct PR/workstream:** PR #31 if reproduced/correlated.
- **Recommended next action:** watch/ecological.

### CGW-009 — Submission can be accepted while local send/control acknowledgement remains indeterminate

- **Class:** likely-defect
- **Final classification:** NEEDS-OUT-OF-BAND-TEST; MUST RETURN TO FRESH PLANNER
- **User impact:** ChatGPT can begin generation after receiving the prompt while the local `send` stage times out, causing Goose to report failure despite a live useful remote execution.
- **Frequency / severity:** one strong historical natural case plus later send-stage timeouts with weaker/closed-target evidence; severe when it occurs.
- **Exact supporting evidence:** `docs/chatgpt-web-reliability-closeout.md` distinguishes the repaired diagnostic overlap from a turn where the full prompt reached ChatGPT and generation started while local send acknowledgement stalled (`4f823b086f9c`). Source at `a98ab0d`: `browser-worker.ts` awaits `sendButton.press("Enter")` **before** running `waitForSubmissionAccepted()`. If the Playwright press promise stalls, the stronger acceptance evidence is never queried. Later timeouts (`cbbbf1b3d152`, `3454230f4713`, `5708bb1bc247`, `e7ecc340a0ff`, `e33c7b505cba`) mostly late-settle as `target_closed`/abort and therefore do not independently prove the same false-negative path.
- **Current root-cause confidence:** high that the sequential acknowledgement gap exists; medium that it remains a frequent post-`7f99` ecological cause.
- **Known facts:** the old `composer_ready` diagnostic overlap / broad login rewrite was fixed by `7f99f187...` and must not be reopened under this ID. Starting a second Playwright operation while the first is stuck can recreate the very control-overlap problem that `7f99` removed.
- **Unknowns:** what independent, non-overlapping signal can safely prove submission while the press RPC is outstanding (native BrowserHost lifecycle, browser network/navigation evidence, or another signal), and whether recent stalls still exhibit remote acceptance.
- **Overlap / dependency:** distinct from CGW-015 fixed diagnostic overlap; should be tested after CGW-004's overlap provenance is cleaner.
- **Current implementation / fix status:** remaining gap not repaired.
- **Activated runtime contains relevant repair:** contains the diagnostic-overlap repair, not a dedicated send-indeterminate settlement repair.
- **Can existing evidence fully specify a fix?** NO; a naive parallel DOM poll is unsafe.
- **Smallest proposed repair if YES:** N/A until an independent acknowledgement signal is established.
- **Required deterministic regression tests:** once signal is selected: press acknowledgement stalls after actual submission; chosen independent acceptance signal resolves success; no second Playwright control operation overlaps the stuck press; genuine non-submission still preserves original timeout/error.
- **Out-of-band runtime testing required:** YES, packet OOB-009.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** after CGW-002/003 and CGW-004 purpose correlation, run a single isolated send-ack discriminating experiment and return to planner.

### CGW-010 — Large inline context is strongly correlated with failure, but PR #32's causal transport hypothesis is not proven

- **Class:** design-track
- **Final classification:** NEEDS-OUT-OF-BAND-TEST; MUST RETURN TO FRESH PLANNER
- **User impact:** large Goose sessions can require very large browser-composer prompts; affected turns appear slower and less reliable, especially around compaction, send/control, and concurrent surfaces.
- **Frequency / severity:** all observed >150k-char inline prompts failed/aborted in this corpus; potentially important for long sessions, but the sample is confounded.
- **Exact supporting evidence:** PR #32 docs; current source compiles complete accumulated context inline; `tests/goose-compaction-liveness.test.ts` has a deterministic 592k-character stock compaction estimating roughly 150k–170k tokens. Joined flight/log evidence: max completed 49,174 chars; 143,988-char trace aborted; three 150k–350k traces failed; seven >471k failed. However all seven >471k traces also had concurrent browser turns and several fail in connector/send/control paths. Successful prompt-attachment durations do not rise monotonically with prompt chars.
- **Current root-cause confidence:** high that large contexts correlate with the bad epochs; low-to-medium that inline composer attachment itself is the root cause.
- **Known facts:** PR #32's immutable provider-owned context-artifact design is coherent but remains a design proposal, not a diagnosis. Small-context continuations clearly succeed. Large-context failure can be mediated by concurrency/UI control rather than attachment throughput alone.
- **Unknowns:** isolated size threshold; whether large stock compaction fails with exactly one active surface; whether send/control or composer attachment is the first size-sensitive boundary; whether externalization is necessary after concurrency/settlement fixes.
- **Overlap / dependency:** leading overlap with CGW-004; do not implement PR #32 until same-session overlap is understood. Separate from PR #31 unless evidence proves a narrow PR #31 control fix first.
- **Current implementation / fix status:** design-only PR #32; no runtime implementation.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** if PR #32 proceeds: artifact immutability/integrity, bounded sequential reads, EOF-before-task-action, missing/corrupt artifact fail-closed, small-inline fallback, no tool-capability escalation, complete context reconstruction.
- **Out-of-band runtime testing required:** YES, packet OOB-010, but only after identity/settlement contamination is removed.
- **Correct PR/workstream:** PR #32.
- **Recommended next action:** bounded isolated size experiment, then fresh planner decides whether to implement externalization or a narrower control fix.

### CGW-011 — Provider-demand / low-resource BrowserHost lifecycle design lacks the Goose-native lifecycle trigger

- **Class:** design-track
- **Final classification:** NEEDS-MORE-PLANNING
- **User impact:** current always-on BrowserHost behavior consumes Electron/browser resources even when ChatGPT-Web is unused; a poor lazy-start implementation could instead add per-turn churn or violate lifecycle ownership.
- **Frequency / severity:** persistent resource/UX concern, not a current correctness regression.
- **Exact supporting evidence:** PR #33 docs; `docs/runtime-lifecycle.md`; current config supports both `managed-chrome` and `launcher`; canonical ownership explicitly keeps daemon/tunnel independent and Electron BrowserHost-only.
- **Current root-cause confidence:** N/A; this is design work.
- **Known facts:** desired policy is no ChatGPT-Web processes solely for Goose when Goose is closed; minimum ingress when Goose is open but provider unused if native lifecycle hooks allow it; lazy ensure BrowserHost on first provider use; reuse for application lifetime; no per-chat churn; no generic ambiguous-failure recovery.
- **Unknowns:** the authoritative Goose provider/app startup/shutdown hook and whether it can safely own demand signalling without inventing a second orchestration API.
- **Overlap / dependency:** must remain separate from PR #31 recovery and from Goose Control. CGW-012 reboot proof is a lifecycle validation item, not the demand-start design itself.
- **Current implementation / fix status:** design-only PR #33.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** to be designed only after the real Goose lifecycle boundary is identified.
- **Out-of-band runtime testing required:** not yet; next work should be bounded source/API planning against the current Goose lifecycle surface, then return to a fresh planner before implementation.
- **Correct PR/workstream:** PR #33.
- **Recommended next action:** defer until PR #31 correctness and PR #32 evidence are cleaner.

### CGW-012 — Actual macOS reboot/login lifecycle reconstruction is still unproven

- **Class:** validation-gap
- **Final classification:** NEEDS-OUT-OF-BAND-TEST
- **User impact:** login-time recovery after a real reboot may differ from the live-checked autostart sequence; claiming full autostart reliability without this proof would overstate evidence.
- **Frequency / severity:** unknown; one exact validation gap.
- **Exact supporting evidence:** `docs/runtime-lifecycle.md`, README, roadmap explicitly mark actual reboot/login reconstruction **NOT RUN**.
- **Current root-cause confidence:** N/A; no defect is asserted.
- **Known facts:** ordered launchd coordinator and non-reboot live checks are implemented; self-interference from lifecycle testing inside an active BrowserHost-backed turn is not valid regression evidence.
- **Unknowns:** actual post-login reconstruction outcome.
- **Overlap / dependency:** lifecycle baseline / PR #33; should not be run from a turn depending on the runtime being rebooted.
- **Current implementation / fix status:** no code change implied.
- **Activated runtime contains relevant repair:** current autostart baseline is active, actual reboot proof absent.
- **Can existing evidence fully specify a fix?** N/A until test result.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** no synthetic substitute for the missing proof; retain existing lifecycle tests.
- **Out-of-band runtime testing required:** YES, operator-controlled and late in the sequence.
- **Correct PR/workstream:** lifecycle validation / PR #33 context.
- **Recommended next action:** perform only from a fully out-of-band session with pre-recorded checkpoints and a post-login return contract; a PASS updates evidence, a FAIL returns to planner before any fix.

### CGW-013 — `bun run verify` mixes hermetic verification with a headed managed-Chrome release smoke on macOS

- **Class:** validation-gap
- **Final classification:** READY-FOR-FIX
- **User impact:** a routine full verification can unexpectedly launch headed Chrome and manipulate a browser runtime, making it unsafe for self-hosted reconnaissance and blurring Electron BrowserHost validation with managed-Chrome compatibility coverage.
- **Frequency / severity:** deterministic on macOS when the full verify reaches `scripts/smoke-release.ts`.
- **Exact supporting evidence:** `scripts/verify.ts` always invokes `scripts/smoke-release.ts`; the smoke config explicitly sets `browserHost: "managed-chrome"`, `headed: true`, and on Darwin runs `browser check`. CI/release also use `bun run verify`. At the same time, `src/config.ts` formally supports both `managed-chrome` and `launcher`, with managed Chrome still the default config mode, so compatibility coverage is a real support contract and must not simply be deleted. Deployed standalone Goose architecture uses Electron `launcher` BrowserHost.
- **Current root-cause confidence:** high.
- **Known facts:** the issue is validation architecture, not a reason to drop managed-Chrome support; CI/release can explicitly retain the compatibility smoke while a self-host-safe verification command remains hermetic/browser-free.
- **Unknowns:** naming choice for the explicit browser smoke command.
- **Overlap / dependency:** improves safe validation for all later issues; does not change runtime ownership.
- **Current implementation / fix status:** current verify still launches headed managed Chrome on macOS.
- **Activated runtime contains relevant repair:** N/A.
- **Can existing evidence fully specify a fix?** YES.
- **Smallest proposed repair:** split release artifact validation from optional live managed-Chrome browser checking. Make ordinary `bun run verify` browser-free/hermetic; preserve an explicit managed-Chrome compatibility smoke command and invoke it deliberately in CI/release where appropriate. Do not replace it with Electron BrowserHost live testing inside ordinary verify; Electron launcher remains covered by deterministic launcher tests/build/package smoke and separately bounded lifecycle qualification.
- **Required deterministic regression tests:** unit/testable argument parsing or command-plan test showing default verify does not request browser check and explicit compatibility smoke does; retain current relocated-runtime non-browser checks. CI workflow must explicitly preserve managed-Chrome coverage rather than losing it silently.
- **Out-of-band runtime testing required:** NO to implement the split. The explicit live smoke should be run only in an isolated executor/CI, not from a self-hosted ChatGPT-Web turn.
- **Correct PR/workstream:** validation hardening, preferably a scoped PR #31 follow-up.
- **Recommended next action:** implement after CGW-002/003 or in parallel by a non-self-hosted executor.

### CGW-014 — Three-surface topology exists; reliable parent + two-child completion is not qualified

- **Class:** validation-gap
- **Final classification:** WATCH / ECOLOGICAL
- **User impact:** aggressive ChatGPT-Web fan-out may degrade control paths or completion reliability even though simultaneous surfaces can be created.
- **Frequency / severity:** topology proven; reliable completion unknown. Current recommendation remains parent + at most one ChatGPT-Web child at a time.
- **Exact supporting evidence:** README, roadmap, reliability closeout, prior concurrency qualification docs, passive corpus with maximum active browser turns of 3 in five traces and numerous failures during high-contention epochs.
- **Current root-cause confidence:** no single concurrency defect is isolated; current evidence is contaminated by CGW-002/004/010 and earlier UI failures.
- **Known facts:** three-way overlap is real; reliable three-way completion is not.
- **Unknowns:** residual concurrency limit after earlier defects are fixed.
- **Overlap / dependency:** qualification depends on earlier identity, settlement, and context hardening.
- **Current implementation / fix status:** no new concurrency change warranted.
- **Activated runtime contains relevant repair:** N/A.
- **Can existing evidence fully specify a fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** none yet; later bounded parent+2 qualification after upstream defects are resolved.
- **Out-of-band runtime testing required:** eventually, but not yet. Do not run load/stress qualification while earlier defects contaminate results.
- **Correct PR/workstream:** later qualification after PR #31/32 hardening.
- **Recommended next action:** watch; schedule bounded parent+2 qualification last.

### CGW-015 — Historical Playwright diagnostic overlap / false login reinterpretation

- **Class:** fixed-observe
- **Final classification:** FIXED / OBSERVE
- **User impact:** a timed-out routine diagnostic could remain outstanding, overlap a later critical browser stage, and cause real composer/control failures to be broadly rewritten as authentication expiry.
- **Frequency / severity:** natural Day Shift incident; severe before repair.
- **Exact supporting evidence:** `docs/chatgpt-web-reliability-closeout.md`, roadmap, PR #31; fix checkpoint `7f99f187295135de1507c3fcd63aca08e9c01810`. Focused control instrumentation and subsequent ecological use support the repair.
- **Current root-cause confidence:** high and repaired.
- **Known facts:** launcher/Electron turns no longer run routine Playwright screenshot/evaluate diagnostics on the critical path; stale same-trace diagnostic overlap is blocked; real composer errors are preserved; managed-Chrome terminal capture remains separately supported.
- **Unknowns:** none requiring action absent regression.
- **Overlap / dependency:** must not be conflated with CGW-009's remaining send-ack indeterminacy.
- **Current implementation / fix status:** fixed and activated before `a98ab0d`.
- **Activated runtime contains relevant repair:** YES.
- **Can existing evidence fully specify another fix?** NO.
- **Smallest proposed repair if YES:** N/A.
- **Required deterministic regression tests:** retain existing control-path instrumentation / non-overlap coverage.
- **Out-of-band runtime testing required:** NO.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** observe only.

## 3. Same-root-cause / duplicate map

Symptoms and PR comments should map to the register as follows rather than becoming separate issues:

| Symptom / breadcrumb | Canonical issue(s) | Relationship |
| --- | --- | --- |
| Fresh Goose chats with identical text replay same old descriptor error | CGW-002 + CGW-003 | Two mechanisms: cross-session content identity collision exposes a stale exact-key settled infrastructure error. |
| `Launcher browser host is unavailable: descriptor is missing` after BrowserHost restoration | CGW-003 | Pre-lease availability error classification/retirement, not PR #33 lazy-start design. |
| Two ChatGPT windows after a Goose network failure | CGW-004 + CGW-006 | Outer request can die while browser remains alive; a distinct same-session execution can then own another surface. Exact retry duplication is not proven. |
| Repeated close/reopen/retry / retained active browser turns / 12-turn spinout | CGW-004, operationally CGW-005 | Amplification symptom; supported cancellation is recovery, not cause/fix. |
| `Network error: Stream decode error` near 603–606s | CGW-006 | Current recorder localizes cancellation to the caller at ~600s; no daemon body-decode error is recorded. |
| Broker timeout / orphaned tool state | CGW-007, sometimes downstream of CGW-006/004 | Not enough clean evidence for a separate current broker fix. |
| `Connection interrupted. Waiting for the complete answer` | CGW-008 | Ecological UI symptom; no current recorder occurrence. |
| Prompt accepted / generation starts but local send fails | CGW-009 | Separate from the fixed diagnostic-overlap incident CGW-015. |
| ~560–579k prompt failures | CGW-010, possibly CGW-004 | Strong size correlation; many are concurrent and may be stock compaction. Do not call attachment causally proven. |
| Short `@g`, polluted menu, missing connector row | CGW-001 | Repaired by `a98ab0d`; observe only. |
| True BrowserHost absent when provider is first needed | CGW-011 | PR #33 design boundary, not CGW-003 stale replay. |
| Actual reboot/login not proven | CGW-012 | Validation gap, not evidence of a lifecycle defect. |
| `bun run verify` opens headed Chrome | CGW-013 | Validation/support split; managed-Chrome compatibility remains supported. |
| Parent+2 child overlap but unreliable completion | CGW-014 | Late qualification; do not use current mixed failures as a concurrency root cause. |

## 4. READY-FOR-FIX queue

### RF-1 / CGW-002 — Namespace standalone execution identity by trusted Goose session

**Implementation packet**

1. Limit edits to standalone identity plumbing in `src/server.ts` plus focused standalone server tests.
2. Read `agent-session-id` once as trusted request metadata before standalone identity tagging.
3. When present, hash the existing normalized standalone identity prefix together with that session namespace. Keep the current content-only hash when the header is absent.
4. Preserve exact retry/tool-round idempotency inside one session and preserve `<turn-context>` stripping.
5. Do not use session ID alone; one Goose session contains multiple distinct user turns.
6. Do not change retry budgets, BrowserHost lifecycle, connector behavior, or response-state semantics.
7. Add the six deterministic regressions listed in CGW-002.
8. Run only focused deterministic tests plus ordinary typecheck if desired; do not activate/restart/live-qualify from a self-hosted executor.

**Done when:** tests prove identical prompts in distinct `agent-session-id`s yield different execution identities while legitimate same-session retry/continuation semantics remain unchanged.

### RF-2 / CGW-003 — Make explicit pre-lease BrowserHost availability errors retryable/non-poisoning

**Implementation packet**

1. Define a narrow structured adapter error boundary for launcher descriptor/process/control/helper readiness failures that occur before a turn surface is leased.
2. Preserve original causal text/cause and use one stable code; mark only this explicit infrastructure family retryable.
3. Reuse existing retryable session retirement and bounded retry-circuit behavior. Do not add retries or raise timeout counts.
4. Add deterministic tests: fail-then-success exact key starts a second runtime; fail-twice opens existing circuit; unrelated generic errors remain terminal/replayable; original cause survives.
5. No live descriptor deletion/reproduction is required.

### RF-3 / CGW-005 — Package the already-proven recovery procedure

**Implementation packet**

1. Reconcile the existing plan with current CLI command spelling.
2. Add `.agents/skills/chatgpt-web-runtime-recovery/SKILL.md` with strict trigger, minimal preflight, supported `service cancel-turns`, clean-idle verification, escalation boundary, prohibited actions, and compact return contract.
3. Add one short `AGENTS.md` rule that points retained-turn/replacement-surface spinout recovery to the skill.
4. Do not diagnose the underlying defect inside the skill; do not add process-kill orchestration.
5. Validate discovery/structure without invoking recovery against the current runtime.

### RF-4 / CGW-013 — Split hermetic verification from explicit managed-Chrome compatibility smoke

**Implementation packet**

1. Preserve `managed-chrome` as a supported BrowserHost mode and retain its release/compatibility smoke.
2. Refactor release smoke so the live Darwin `browser check` is explicitly opted into rather than an implicit part of ordinary `bun run verify`.
3. Keep default verification build/type/test/release-artifact checks browser-free.
4. Update CI/release to call the explicit managed-Chrome check deliberately so coverage is not lost.
5. Add a deterministic command/argument test where practical; do not validate this change by launching a browser from a self-hosted turn.

## 5. NEEDS-OUT-OF-BAND-TEST queue

### OOB-004 / CGW-004 — Identify the purpose of same-session overlapping executions

- **Exact question:** In the natural duplicate-surface pattern, is the large execution a stock Goose compaction overlapping an ordinary response, or are two other request purposes being admitted concurrently?
- **Remaining hypotheses:** H1 stock `_gooseCompactionRequest` + ordinary response overlap; H2 ordinary response + `complete_fast()`/session metadata task; H3 two independent ordinary responses caused by outer recovery/retry behavior; H4 another purpose.
- **Preconditions:** CGW-002 and CGW-003 implemented/activated; clean idle runtime; no retained browser turns; out-of-band executor not hosted by the runtime it is observing.
- **Allowed actions:** add/enable the smallest privacy-safe request-purpose telemetry if needed (`requestKind`, `stockGooseCompaction` boolean, normalized input item count/compiled prompt chars; no bodies); observe one naturally occurring compaction/continuation or use an isolated Goose session whose compaction is already imminent; inspect passive recorder/launcher/daemon logs.
- **Prohibited actions:** no generic per-session mutex; no timeout/retry changes; no stress/concurrency fan-out; no manual surface close; no service kill; no PR #32 externalization; no Goose Control changes.
- **Exact observations to capture:** agent-session-id hash, request kind, execution-key hash, trace ID, request accepted timestamp, compiled prompt chars/tokens, active browser count, lease/release timestamps, Responses outcome, whether the second request started before the first settled.
- **Expected interpretation:** H1 => likely compaction scheduling/supersession problem; return to planner to choose Goose vs provider serialization boundary and relation to PR #32. H2 => planner decides whether metadata task should bypass BrowserHost or be serialized. H3 => revisit outer retry/settlement logic. H4 => report exact purpose before any fix.
- **Stop boundary:** stop after one clean reproducing overlap with both purposes identified, or after one natural compaction cycle shows no overlap; do not continue into implementation.
- **Compact return contract:** one table of the two executions + hypothesis verdict + exact trace/log breadcrumbs + no proposed code unless asked by the fresh planner.

### OOB-006 / CGW-006 — Locate the approximately 600-second outer deadline

- **Exact question:** Which outer Goose/provider/client component cancels an otherwise active streaming Responses request at ~600s despite SSE heartbeat activity?
- **Remaining hypotheses:** H1 Goose HTTP client has a total-request/body deadline near 600s; H2 another outer provider wrapper/decoder enforces it; H3 OS/proxy transport does; H4 repo daemon terminates it (already disfavored by recorder evidence).
- **Preconditions:** out-of-band executor; no ChatGPT runtime manipulation required.
- **Allowed actions:** inspect the exact installed/current Goose provider HTTP source/config for total/body/request deadlines; if inconclusive, point Goose at a local mock Responses endpoint that emits valid SSE heartbeat/deltas continuously and completes just after the suspected deadline. Use no ChatGPT/Electron/tunnel.
- **Prohibited actions:** no global timeout increase; no retry changes; no live ChatGPT request; no BrowserHost lifecycle action.
- **Exact observations to capture:** exact source/config owning any deadline; local mock timestamps for first frame, periodic frames, caller cancellation/error, server disconnect; exact user-visible Goose error.
- **Expected interpretation:** fixed total deadline found/reproduced => fresh planner chooses protocol-safe fix/placement; no cancellation past 620s => historical error belongs elsewhere and planner reopens decoder/proxy hypothesis; daemon-side mock failure => investigate repo Responses wrapper.
- **Stop boundary:** source proof of the exact 600s deadline is sufficient; otherwise one mock run crossing it. No implementation.
- **Compact return contract:** deadline owner + exact source/config breadcrumb + mock outcome if run + error text + recommended owner only, not a timeout patch.

### OOB-009 / CGW-009 — Determine a safe independent send-acceptance signal

- **Exact question:** When `sendButton.press("Enter")` stalls after ChatGPT has actually accepted the submission, what signal can prove acceptance without issuing a second overlapping Playwright control operation?
- **Remaining hypotheses:** H1 BrowserHost/Electron-native lifecycle/network signal can prove generation/submission; H2 browser network event can do so without page control; H3 the only available signal requires the same blocked control lane, so the provider must classify timeout as indeterminate and settle differently; H4 recent timeouts no longer represent accepted submissions.
- **Preconditions:** CGW-002/003 fixed; isolated out-of-band runtime; exactly one active surface; no large-context/concurrency experiment in the same run.
- **Allowed actions:** bounded instrumentation around one send; capture Playwright press start/settlement, native BrowserHost lifecycle, request/navigation/network evidence, and existing submission state. A single intentionally induced transport/control stall is allowed only if the out-of-band executor can do it without touching the user's main runtime.
- **Prohibited actions:** no parallel Playwright DOM/evaluate diagnostic while the press is outstanding; no broad retries; no timeout increases; no surface-kill based “proof”.
- **Exact observations to capture:** submission/generation evidence timestamp vs press promise timestamp; whether the chosen signal is independent of Playwright control; original causal error.
- **Expected interpretation:** independent signal precedes stalled press => planner can specify bounded acceptance recovery; only same-lane signal exists => planner must design indeterminate settlement without overlap; no accepted-submission recurrence => keep as watch until ecological evidence returns.
- **Stop boundary:** one clean accepted-but-unacked sample or one bounded non-reproduction; no implementation.
- **Compact return contract:** chronological signal table + independence assessment + hypothesis verdict.

### OOB-010 / CGW-010 — Isolate context size from concurrency/UI contamination

- **Exact question:** With exactly one active BrowserHost surface and no local tools, does increasing inline stock-compaction/context size itself cause prompt-attachment/send/control failure?
- **Remaining hypotheses:** H1 size-sensitive composer attachment is causal; H2 size-sensitive send/generation control is causal after attachment succeeds; H3 the large prompts are reliable in isolation and current failures are primarily concurrency/supersession; H4 remote context/token limit dominates.
- **Preconditions:** CGW-002/003 fixed; CGW-004 request-purpose result available; isolated out-of-band runtime; clean idle; no concurrency.
- **Allowed actions:** a minimal size ladder using the same deterministic read-only compaction shape, ideally one known-small control (~50k chars), one intermediate (~250–300k), one current-problem scale (~560–592k). Capture current passive telemetry only; stop early once a discriminating boundary is observed.
- **Prohibited actions:** no tools, no parent/child fan-out, no timeout increase, no retries beyond existing circuit, no externalization implementation during the experiment.
- **Exact observations to capture:** prompt chars/estimated tokens, attachment duration/outcome, send press/acceptance, first generation, control-liveness, remote error, active surface count exactly 1.
- **Expected interpretation:** isolated size failure => PR #32 gains causal support; isolated large success => prioritize CGW-004/009 instead of externalization; remote `context_length_exceeded` => planner considers threshold/compaction policy; mixed boundary => planner selects minimal transport design.
- **Stop boundary:** at most the three sizes, fewer if discriminating. No fix in the same session.
- **Compact return contract:** three-row result table + first failing stage + exact error + active-surface proof.

### OOB-012 / CGW-012 — Actual reboot/login reconstruction

- **Exact question:** Does the documented ordered autostart reconstruct tunnel -> genuinely ready BrowserHost -> Responses daemon after an actual macOS reboot/login?
- **Remaining hypotheses:** H1 documented ordering reconstructs cleanly; H2 one dependency races or fails at real login; H3 environment/login-session differences invalidate a live-check assumption.
- **Preconditions:** operator explicitly accepts reboot; no active work depending on the host; current git/runtime revision and log offsets recorded before reboot.
- **Allowed actions:** actual reboot/login, then read-only lifecycle status/readiness checks and one ordinary later Goose proof from a separate session if the lifecycle is healthy.
- **Prohibited actions:** do not perform the reboot from a BrowserHost-backed turn that must survive it; no manual service reconstruction before capturing the first post-login state; no broad process kills.
- **Exact observations to capture:** post-login process/start order, descriptor/readiness result, daemon/tunnel/launcher log boundaries, exact revision, first ordinary Goose result.
- **Expected interpretation:** PASS => update lifecycle evidence only. FAIL => preserve first causal failure and return to planner; do not improvise lifecycle ownership changes.
- **Stop boundary:** one reboot/login cycle.
- **Compact return contract:** PASS/FAIL, ordered timestamps, first causal failure if any, and exact log breadcrumbs.

## 6. NEEDS-MORE-PLANNING queue

This is the mandatory fresh-planner return set. It is a subset of the out-of-band work above plus PR #33 design work; the experiment must not flow directly into implementation when its result can change the fix boundary.

1. **CGW-004** — same-session overlap: result decides whether repair belongs in Goose scheduling, provider admission/supersession, or context transport.
2. **CGW-006** — ~600s cancellation: result decides repo-local vs Goose client fix and must not become a blind timeout increase.
3. **CGW-009** — send acknowledgement: result decides which independent acceptance signal, if any, can be used without reintroducing overlapping Playwright control.
4. **CGW-010** — large context: result decides whether PR #32 externalization is justified or whether concurrency/control repair removes the need.
5. **CGW-011** — PR #33: a fresh planner must first reconcile the current Goose provider/application lifecycle API with the documented ownership boundary before implementation.

## 7. WATCH / FIXED queue

### FIXED / OBSERVE

- **CGW-001 connector mention activation** — fixed at `a98ab0d`; latest `5acef0a21af2` live proof passes.
- **CGW-015 diagnostic overlap / false login reinterpretation** — fixed at `7f99f187...`; retain regression telemetry only.

### WATCH / ECOLOGICAL

- **CGW-007 broker/orphan behavior** — capture the next exact broker-timeout phase before designing a fix.
- **CGW-008 ChatGPT-native connection interruption** — no current recorder occurrence; do not manufacture one.
- **CGW-014 parent+2 concurrency completion** — delay qualification until identity/settlement/context contamination is removed.

### DESIGN / LATE VALIDATION

- **CGW-011 PR #33 provider-demand lifecycle** — separate design track.
- **CGW-012 reboot/login proof** — explicit late out-of-band validation.

## 8. Dependency-ordered hardening plan

1. **CGW-002 — execution identity.** Fix first because content equality currently contaminates every later retry/failure interpretation.
2. **CGW-003 — stale pre-lease failure settlement.** Prevent a transient BrowserHost availability error from poisoning a legitimate exact-key retry after identity is trustworthy.
3. **CGW-005 — recovery skill.** Package the proven minimal recovery before later experiments so out-of-band agents have a safe stop path if retained-turn spinout recurs.
4. **CGW-004 — purpose-correlate same-session overlapping executions.** Do not write a generic mutex; identify compaction/main-turn vs other purposes first.
5. **CGW-009 — send acceptance indeterminacy.** Once overlap provenance is clean, isolate accepted-but-unacknowledged sends without overlapping Playwright controls.
6. **CGW-006 — outer ~600s cancellation.** This can run independently using Goose source/local mock, but implementation placement should follow clean provider settlement evidence.
7. **CGW-010 / PR #32 — isolated context-size experiment, then planning.** Only after same-session overlap is understood; implement externalization only if causal evidence supports it.
8. **CGW-013 — verification split.** This is implementation-ready at any point by a separate non-self-hosted executor; ensure it lands before the next phase relies on routine `bun run verify` from an agent environment.
9. **CGW-011 / PR #33 — provider-demand lifecycle.** Keep ownership boundaries unchanged; plan against real Goose lifecycle hooks after PR #31 correctness stabilizes.
10. **CGW-012 — actual reboot/login proof.** Run out of band after lifecycle code/config is intentionally stable.
11. **CGW-014 — broader parent+2 concurrency qualification.** Last, because earlier defects otherwise contaminate the verdict.

CGW-007 and CGW-008 remain ecological watches throughout. If either produces a new clean trace, insert it into the order according to whether it contaminates settlement or is merely UI/transient noise.

## 9. Recommended next Sonnet / Claude / Codex packet

Run **RF-1 / CGW-002 only**. Do not combine it with stale-error classification, runtime activation, or live qualification.

### Objective

Repair standalone ChatGPT-Web execution identity so fresh Goose sessions with identical normalized prompt text cannot share one synthetic `turn_id` / execution key, while preserving exact retry and tool-continuation idempotency inside one Goose session.

### Starting state

- Repo: `/Users/luke/Documents/goose-chatgpt-web`
- Expected branch/head at handoff: `fix/electron-native-liveness` / `a98ab0d342623a562ca71a847aa3ebf6d3dd3032` unless the planner explicitly updates this register first.
- Relevant files: `src/server.ts`, `tests/server-standalone.test.ts`; inspect narrowly related standalone identity tests only as needed.
- Current behavior: `tagStandaloneIdentity()` hashes normalized standalone input content without the already-trusted `agent-session-id` request header.

### Required change

1. Plumb a trusted optional standalone identity namespace from `agent-session-id` into the synthetic identity calculation.
2. When present, synthetic identity must depend on both that namespace and the existing normalized standalone identity prefix.
3. When absent, retain current content-only digest compatibility.
4. Do not use `agent-session-id` alone.
5. Preserve volatile `<turn-context>` stripping and all existing explicit native turn-ID behavior.

### Required deterministic tests

1. Same normalized request + session A vs session B => different synthetic turn IDs/execution keys.
2. Same normalized request + same session => same identity.
3. Same session + tool result continuation of that execution => same identity.
4. Same session + genuinely new latest user message => different identity.
5. Only `<turn-context>` volatility changes => same identity within the same session.
6. No `agent-session-id` => current byte-identical retry behavior remains.

### Allowed actions

- Read/edit only the narrowly relevant source/tests.
- Run focused deterministic tests that do not launch Chrome/Electron/BrowserHost/daemon/tunnel/live ChatGPT.
- Run typecheck if desired.
- Return exact diff summary and test results.

### Prohibited actions

- Do not run `bun run verify`.
- Do not run browser check, lifecycle start/stop/restart, service cancellation, live Responses/ChatGPT qualification, concurrency/load/stress, or any runtime activation.
- Do not change timeout/retry budgets, connector selection, BrowserHost lifecycle, PR #32 externalization, PR #33 demand-start behavior, Goose Control, or recovery orchestration.
- Do not touch `scripts/open-manual-browser.ts` or `scripts/proof-mcp-server.ts`.
- Do not commit/push/rebase/reset/stash/clean.

### Stop boundary / return contract

Stop after the focused implementation and deterministic tests are clean. Return:

- files changed;
- one-paragraph behavior delta;
- exact focused test/typecheck commands and results;
- any discovered incompatibility that prevents the six required identity invariants.

Do **not** activate or live-prove the change in that same session. A fresh planner should review the implementation result before the separate activation/proof step.
