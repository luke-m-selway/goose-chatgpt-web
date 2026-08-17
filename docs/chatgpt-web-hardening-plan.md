# ChatGPT-Web hardening plan

Status: **canonical planning / diagnosis register**  
Updated: **2026-08-16**
Primary runtime workstream: **PR #31 — `fix/electron-native-liveness`**  
Related design tracks: **PR #32 — large-context continuation**, **PR #33 — provider-demand BrowserHost lifecycle**

This document is the canonical evidence-driven hardening register for the current ChatGPT-Web provider. It separates diagnosis, bounded experiments, implementation, activation, and proof. It does not authorize broad retries, larger timeout budgets, lifecycle redesign, or provider-specific recovery in Goose Control.

## 1. Current state

### Repository / deployed source reconciliation

- Local branch: `fix/electron-native-liveness`.
- CGW-003 reconciliation start HEAD: `73853f8e8bedacbf39fb88d296144e01b1e53889` — `docs(chatgpt-web): mark CGW-002 FIXED / OBSERVE after activation proof`.
- PR #31 remote head at that reconciliation point: the same `73853f8...` revision.
- Worktree at CGW-003 reconciliation start: no tracked modifications; only the protected pre-existing untracked files `scripts/open-manual-browser.ts` and `scripts/proof-mcp-server.ts`.
- Read-only runtime reconciliation on 2026-08-16 found launchd daemon pid `16165` and tunnel pid `15665` running from the current project/runtime layout; BrowserHost pid `15779` runs Electron from `/Users/luke/Documents/goose-chatgpt-web/launcher`.
- The active BrowserHost descriptor at `/Users/luke/.goose-chatgpt-web-dev/runtime/launcher-browser.json` points at this worktree's `.launcher-runtime/browser-helper.cjs` (descriptor `createdAt=2026-08-15T23:11:12.504Z`). No lifecycle action was performed during CGW-003 work.
- The live processes predate the CGW-003 working-tree implementation below, so they must not be treated as activation evidence for it. Older PR/runtime snapshots remain historical evidence only.

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

- **Class:** fixed-observe
- **Final classification:** FIXED / OBSERVE
- **User impact:** two genuinely fresh Goose chats that send the same normalized prompt can be treated as one ChatGPT-Web execution. A settled success/error can be replayed into the wrong logical Goose session without opening a browser surface.
- **Frequency / severity:** deterministic when normalized request content collides; severe because it breaks execution identity and contaminates later diagnosis.
- **Exact supporting evidence:** `docs/chatgpt-web-ecological-supplement-2026-08-14.md`; PR #31 discussion; passive trace `55d7c2bed175` was reused by agent sessions `20260814_28`, `_29`, `_30`, `_31`, `_32`, `_35`, `_36` with the same execution-key hash and no new browser lease on later requests; distinct prompt/session `_34` used trace `70b87737e109`, leased a surface, and completed. Source: `src/server.ts` `tagStandaloneIdentity()` computes `standalone_<sha256(normalized input prefix)>` and `responseRequest()` does not namespace this synthetic identity with the already-trusted `agent-session-id` header. `tests/server-standalone.test.ts` currently encodes byte-identical content reuse without distinguishing client session scope.
- **Current root-cause confidence:** high.
- **Known facts:** exact HTTP retries and tool-result rounds within one logical Goose execution must remain idempotent; fresh Goose sessions must not collide merely because prompt text is equal; volatile `<turn-context>` remains intentionally excluded.
- **Unknowns:** none material to the narrow repair.
- **Overlap / dependency:** explains the cross-session stale replay portion of execution-identity incidents. It is distinct from CGW-003 (a transient error being retained within a legitimate exact execution).
- **Current implementation / fix status:** repaired by `cd21c604` (namespace standalone identity by Goose session), following independent ChatGPT-Web semantic review (verdict PASS).
- **Activated runtime contains relevant repair:** YES, confirmed by out-of-band activation on 2026-08-16.
- **Can existing evidence fully specify a fix?** YES; repair implemented per the packet below.
- **Smallest proposed repair:** implemented as an optional trusted standalone identity namespace derived from `agent-session-id`; the synthetic identity is computed from `(trusted session namespace, normalized standalone identity prefix)` when that header is present. `agent-session-id` alone is not used, since multiple user turns within one Goose session must remain distinct. The content-only digest remains the compatibility fallback for standalone clients that supply no session header.
- **Required deterministic regression tests:** (1) same normalized body + different `agent-session-id` => different synthetic turn/execution keys; (2) same normalized body + same `agent-session-id` => same key; (3) same session + tool-result continuation for the same turn => same key; (4) same session + new latest user message => different key; (5) volatile `<turn-context>` differences remain ignored; (6) no-header compatibility retains current byte-identical retry collapse.
- **Out-of-band runtime testing required:** DONE 2026-08-16. Canonical `codex-chatgpt-web lifecycle restart` activated `cd21c604` (fresh daemon pid, fresh tunnel pid, fresh BrowserHost pid; 0/0 active HTTP/browser turns before and after). Two sequential, genuinely separate, persisted ordinary Goose sessions (`20260815_38` / `cgw002-proof-a` and `20260815_39` / `cgw002-proof-b`) sent byte-identical prompt text instructing a Goose Native shell call followed by an exact reply. Both produced the required visible result and completed. Flight-recorder evidence: session A trace `b879417c7eb7` / execution-key hash `b879417c7eb7c7ac...02ea12`, surface `PEzf4rxdSOXGjeoEH320EgWAbdc3hi3a`; session B trace `3a8d671ce352` / execution-key hash `3a8d671ce35227ce...8075ab`, surface `OxY-OM-wOQKFUQ4TeY9xKwgZj6gTfW0w` — cross-session trace/execution identities differ and each leased its own live BrowserHost surface (no settled-state replay). Within each session, the initial tool-request round and the `function_call_output` continuation shared the same traceId and executionKeyHash (verified from each trace's `events.jsonl`), confirming stable same-session logical execution identity. Final health after proof: 0/0 active HTTP/browser turns, daemon/tunnel/BrowserHost healthy.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** observe only; reopen only with a post-`cd21c604` trace that violates the repaired contract (cross-session collision or within-session identity drift).

### CGW-003 — Pre-lease launcher availability failures can poison exact-key settled replay

- **Class:** fixed-observe
- **Final classification:** FIXED / OBSERVE
- **User impact:** a transient BrowserHost descriptor/readiness failure can settle as a generic non-retryable error and remain cached for the exact execution key, so a later legitimate retry can replay the old error after BrowserHost health has returned.
- **Frequency / severity:** confirmed in the 2026-08-14 recovery sequence; severe when it occurs because healthy runtime restoration does not clear the logical execution's cached failure.
- **Exact supporting evidence:** ecological supplement records `Launcher browser host is unavailable: descriptor is missing ...`; passive `55d7c2bed175` shows immediate failure without a surface lease followed by repeated same-key failures after runtime restoration, while fresh `70b87737e109` leased and succeeded. Source: `src/launcher-browser-host.ts` emits plain `Error` for missing/stale/invalid descriptor/process/readiness conditions. `src/adapters/chatgpt-web/index.ts` only retires a turn session automatically when the thrown value is a retryable `ChatGptWebAdapterError`; generic errors are cancelled but remain eligible for settled replay. The retry circuit treats unclassified generic errors as terminal/open.
- **Current root-cause confidence:** high for the stale replay mechanism; the exact first missing-descriptor event is documented rather than body-recorded because the recorder intentionally stores no request body.
- **Known facts:** launcher absence before a lease is an infrastructure availability failure, not a model/user error; bounded retry circuit already limits retryable failures to one recovery browser attempt.
- **Unknowns:** none material to the bounded implementation. The stable public code is `chatgpt_browser_host_unavailable`; failures after a lease-capable `/v1/turn/start` request is dispatched remain deliberately outside that classification because lost-response state is ambiguous.
- **Overlap / dependency:** CGW-002 lets this poison cross fresh sessions; after CGW-002 it can still poison an exact legitimate retry within one session, so it remains independently real.
- **Current implementation / fix status:** repaired by `2509f7de` (retire pre-lease launcher failures), following independent ChatGPT-Web semantic review (verdict PASS) and a hermetic 45/45 focused-test pass plus typecheck PASS. Helper startup failures are typed only before any `run` frame is dispatched. In the helper-side launcher path, descriptor failure is tagged as authoritative pre-lease evidence only when descriptor validation fails before the `/v1/turn/start` control POST; failures after that POST remain generic/conservative. The resulting `chatgpt_browser_host_unavailable` error reuses existing retryable-session retirement and the existing two-attempt standalone retry circuit, while preserving the launcher message and the same-process causal chain.
- **Activated runtime contains relevant repair:** YES, confirmed by out-of-band activation on 2026-08-16.
- **Can existing evidence fully specify a fix?** YES.
- **Smallest proposed repair:** implemented at the existing launcher-helper/adapter boundaries: authoritatively pre-lease helper startup and descriptor-admission failures become `ChatGptWebAdapterError(code=chatgpt_browser_host_unavailable, retryable=true)`. No new retry loop or session state was added; the existing retryable-session retirement path removes the failed exact-key session before a later legitimate retry, and the existing retry circuit still permits at most two provider/browser attempts. Post-dispatch launcher-control failures and unrelated generic browser/UI failures keep their prior conservative semantics.
- **Required deterministic regression tests:** implemented hermetically: (1) a real missing launcher descriptor fails before helper dispatch, then a synthetic recovered helper on the exact same execution key is entered and succeeds; a third exact retry replays that successful settlement without another provider start; (2) two missing-descriptor attempts consume only the pre-existing two-attempt budget and the third is blocked by the existing circuit; (3) generic/ambiguous browser failures remain settled exact-key replay state; (4) a descriptor failure before `/v1/turn/start` is explicit pre-lease evidence, while an HTTP failure after the start request reaches the control server is not; (5) causal launcher text is retained end-to-end, with `Error.cause` retained at same-process classification boundaries. All 45 focused tests pass.
- **Out-of-band runtime testing required:** DONE 2026-08-16. Canonical `codex-chatgpt-web lifecycle restart` activated `2509f7de` (fresh daemon pid 21210, fresh tunnel pid 20986; BrowserHost re-authenticated ready; 0/0 active HTTP/browser turns before and after restart; canonical `tunnel status` readiness proof: `processRunning=true healthy=true ready=true state=ready healthz=ok readyz=ok`). Descriptor-loss was **not** deliberately reproduced live; that contract remains covered by the hermetic regression suite above plus the prior 2026-08-14 ecological incident. One ordinary, persisted Goose session (`20260816_3` / trace `bd944020db44`, execution-key hash `bd944020db44cb9499670026f83385fe1f36c94660c5d4b9bab3dfefdd24c95d`) sent a bounded Goose Native shell prompt (`printf CGW003_OK`) through the normal ChatGPT-Web provider path. Flight-recorder evidence: `browser-surface-leased` at 07:03:30.974Z on surface `FWb0GXw6-AU-Vb9S3piuDYFofFQMyIPq`, single broker tool call resolved with `stdout=CGW003_OK exit_code=0`, `browser-surface-release` at 07:04:02.326Z with `activeBrowserTurns=0 outcome=ready reason=turn-end-completed`; `retryCount=0`, `unresolvedBrokerCallCount=0`, `abnormalProcessEvent=false`, `errorClassification=none`, `responsesTransportOutcome=body-normal-close`; no `chatgpt_browser_host_unavailable` event appears anywhere in the current index for this or any prior window. Final health after proof: 0/0 active HTTP/browser turns, daemon/tunnel/BrowserHost healthy, no second restart performed.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** observe only; reopen only with a post-`2509f7de` trace that violates the repaired contract. A deeper helper-process integration test could later exercise a real post-dispatch `/v1/turn/start` control failure across the IPC boundary and confirm it remains generic/conservative; this is not required for CGW-003 qualification.

### CGW-004 — Same-Goose-session distinct executions can overlap because Goose intentionally runs tool-pair summarization beside the ordinary provider turn

- **Class:** Goose-native concurrency contract / provider compatibility, not an admission defect by itself
- **Final classification:** IDENTIFIED — NOT-A-PROVIDER-DEFECT for the same-session overlap itself; do not mark FIXED and do not serialize it
- **User impact:** one Goose session can legitimately own multiple independently admitted provider/browser executions at once. The confusing duplicate-window/reopen symptom is real, but the strongest historical pairs are not duplicate ordinary turns: Goose intentionally starts background tool-pair summarization while the ordinary provider turn is active. Provider/browser failures can therefore be visible on more than one valid operation, and the background batch can keep admitting later summary operations while the ordinary provider operation is still settling.
- **Frequency / severity:** multiple natural incidents; high diagnostic severity because valid Goose concurrency was previously conflated with retry amplification and possible compaction/main-turn overlap.
- **CONFIRMED — operation identity:** Goose 1.45.0 source (`crates/goose/src/agents/agent.rs` + `crates/goose/src/context_mgmt/mod.rs`) first creates the ordinary `stream_response_from_provider(...)` stream, then calls `maybe_summarize_tool_pairs(...)`. That helper returns a `tokio::spawn` task and sequentially summarizes a bounded batch of old tool pairs with `complete_fast(...)`, using the same Goose `session_id`. `complete_fast(...)` and the ordinary stream are both wrapped in Goose's session context, so both requests intentionally carry the same `agent-session-id`. The provider trait itself has no request-purpose field.
- **CONFIRMED — strongest historical pairs:** `e33c7b505cba` (ordinary turn) / `4048d843a134` (first tool-pair summary) in `20260814_42`; `43df7096a128` (ordinary turn) / `baf97a863c1b` (first tool-pair summary) in `20260815_18`; `7926414d69a8` (ordinary turn) / `feae22156c7d` (first tool-pair summary) in `20260814_37`. Each pair has distinct execution keys and retry lineages and no `retry-replacement-linked` relationship. The ordinary member is the large request in all three pairs; the background summary member is the small request.
- **CONFIRMED — direct historical breadcrumbs:** the Goose CLI log terminates the `43df...` ordinary failure under `goose::agents::agent` and, at `baf...` settlement, logs `Failed to summarize tool pair` from `goose::context_mgmt`. In `20260814_42`, after `e33...` fails, the recorder shows a sequence of same-session distinct executions beginning with `4048...`; the Goose session DB simultaneously gains agent-only text summary records whose inherited creation timestamps point back to older tool pairs, matching `summarize_tool_call()`'s storage contract. `20260814_37` shows the same pattern after `792...`: `feae...` succeeds, more same-session small requests follow, and subsequent failures are logged as tool-pair-summary failures.
- **CONFIRMED — `68aa...` is not recovery/retry:** after `baf...` fails, `maybe_summarize_tool_pairs()` continues its bounded `for tool_id in tool_ids` loop. `68aa6355880d` is the next tool-pair summarization operation in that same Goose-owned background batch, not a replacement of `43df...` and not an ordinary-turn retry.
- **CONFIRMED — settlement behavior:** an ordinary provider error sets `provider_errored` and breaks that provider stream, but Goose aborts the background tool-pair task only when the outer cancellation token is cancelled; otherwise it awaits the task and applies any successful summaries. Therefore a failed ordinary provider execution can coexist with still-running summary executions without implying that Goose has already settled the logical turn or that ChatGPT-Web retried it.
- **REFUTED:** the leading “large stock Goose compaction + small ordinary response (or vice versa)” interpretation for these strongest pairs. Stock auto-compaction is awaited before `reply_internal(...)` in Goose 1.45.0, while the observed pair shape matches the separately spawned tool-pair summarizer. Prompt size remains supporting evidence only and was not used to classify request purpose.
- **REFUTED:** the older generic “retry amplification” interpretation for these initial overlaps. All cited operations are first-attempt independent lineages (`retryCount=0`) with no retry-replacement link. The later `68aa...` request is another background summary item, not a retry descendant.
- **UNKNOWN:** whether any separate historical incident outside these reconstructed pairs contains true stock-compaction/ordinary overlap, and whether any provider/browser settlement bug remains once valid Goose-owned concurrency is treated as such. Those are separate questions and are not evidence for serializing this session.
- **Overlap / dependency:** CGW-002/003 remain FIXED / OBSERVE and are not reopened. CGW-010 still owns isolated large-context risk; the large ordinary members here are concurrency-confounded and cannot prove a size defect. CGW-006 may independently explain caller cancellation, but it does not explain these near-simultaneous admissions.
- **Current implementation / fix status:** no CGW-004 causal fix is warranted from this evidence. In particular, no per-session mutex, one-surface restriction, supersession rule, debounce, arbitrary delay, or compaction special case should be added. Intentional Goose concurrency must retain distinct execution identity/ownership.
- **Activated runtime contains relevant repair:** N/A — no runtime repair is proposed or activated for the identified concurrency contract.
- **Can existing evidence fully specify a fix?** NO FIX REQUIRED for admission overlap. Any future settlement defect must be specified against the owning Goose operation and its cancellation/settlement contract rather than against `agent-session-id` alone.
- **Telemetry gap:** no telemetry change is required to close this historical provenance question because the existing Goose CLI log, session metadata, flight recorder, and exact Goose 1.45.0 source establish ownership. The flight recorder still lacks a general Goose-native request-purpose field, and ChatGPT-Web can deterministically recognize only stock Goose compaction from the request body today; do not invent `ordinary-turn` vs `tool-pair-summary` heuristics at the provider boundary.
- **Required deterministic regression tests:** none for a serialization fix. If a later provider settlement defect is isolated under this valid concurrency, its test must preserve one ordinary execution plus independently identified tool-pair-summary execution(s) and prove only the violated settlement/cancellation invariant.
- **Out-of-band runtime testing required:** NO for CGW-004 provenance; OOB-004 is closed by existing evidence below.
- **Correct PR/workstream:** Goose owns creation/scheduling of the tool-pair-summary operations; the Goose/provider boundary currently carries session identity but not operation purpose. ChatGPT-Web must support valid distinct executions rather than serialize them. PR #32 remains separate and still requires isolated CGW-010 evidence.
- **Recommended next action:** treat same-session overlap as valid by default when execution keys differ; diagnose future failures by operation ownership and settlement state, not by session identity or prompt-size asymmetry.

### CGW-005 — Supported retained-turn recovery is packaged as a bounded out-of-band skill

- **Class:** operational
- **Final classification:** IMPLEMENTED / NEEDS-OUT-OF-BAND-QUALIFICATION
- **User impact:** after a retained-turn/replacement-surface spinout, an operator or fresh repair agent no longer needs to rediscover safe cleanup or escalate to broad process restarts/kills unnecessarily.
- **Frequency / severity:** repeated natural incidents; high operational leverage because the safe cleanup path is small but caller re-admission can make one successful cancellation look complete when it is not.
- **Exact supporting evidence:** `docs/chatgpt-web-runtime-recovery-skill-plan.md`; current `src/server.ts` and `src/adapters/chatgpt-web/retry-circuit.ts`; hermetic cancellation coverage in `tests/server-lifecycle.test.ts`; and the latest real cleanup, which began at `active_http_turns=1` / `active_browser_turns=1` and required three supported `codex-chatgpt-web service cancel-turns` invocations (`cancelledBrowserTurns=8`, then `2`, then `2`) because the still-active caller re-admitted new browser work after the first two. Only after the third did authoritative health remain `active_http_turns=0` / `active_browser_turns=0`; no daemon, tunnel, or BrowserHost restart was required.
- **Current root-cause confidence:** high for the recovery contract and caller re-admission interpretation; this remains operational cleanup, not a diagnosis of the incident that created the retained work.
- **Known facts:** `cancel-turns` first opens every currently retained standalone retry lineage and then clears/cancels the current browser-turn registry. It does **not** drain the daemon or acquire Goose scheduling authority, so a live caller can admit a distinct new operation after cancellation. Cancellation completion and recovery completion are therefore separate. Authoritative recovery success is `active_http_turns=0` and `active_browser_turns=0`, retained across another supported runtime-health observation, with existing infrastructure still healthy. Current source also proves aggregate `doctor.ok` is broader than that recovery contract: it is false for any doctor `error` across config/integration/migration/runtime diagnostics, while canonical `tunnel status` uses live managed-service `/healthz` + `/readyz` when available. The tunnel-service regression test explicitly prefers that live health over stale managed-runtime bookkeeping. Elapsed time is not readiness evidence.
- **Unknowns:** the final skill procedure has not yet been independently exercised by a fresh out-of-band agent. The latest ecological cleanup proves that three supported cancellations can be necessary and sufficient, but it was not a qualification run of the packaged skill's full stop/report contract.
- **Overlap / dependency:** operational safety net for CGW-004/CGW-009 and future UI failures; must never be treated as their fix. Caller re-admission belongs to the caller's authority boundary, not to a new provider admission-control mechanism.
- **Current implementation / fix status:** `.agents/skills/chatgpt-web-runtime-recovery/SKILL.md` implemented. It uses `/healthz` for authoritative daemon/turn state, `codex-chatgpt-web service cancel-turns` as the only recovery mutation, canonical component-specific tunnel/BrowserHost/browser status for the recovery-health gate, and `codex-chatgpt-web doctor --json` only as supporting diagnostics rather than an aggregate PASS gate. The three-cancellation hard budget remains unchanged (initial + at most two follow-ups triggered only by renewed browser-turn activity). HTTP-only activity does not spend cancellation budget because `cancel-turns` does not own the outer caller stream. If browser re-admission persists after that budget, the skill stops BLOCKED rather than looping or seizing caller authority. Repo-local discovery is automatic: `goose skills list` discovers the skill, so no `AGENTS.md` activation rule is required.
- **Activated runtime contains relevant repair:** N/A; this is an agent procedure and this session did not activate or exercise it against the live ChatGPT-Web runtime.
- **Can existing evidence fully specify a fix?** YES; no new native/runtime primitive is required because `/healthz`, supported cancellation, canonical `tunnel status`, read-only `lifecycle status`, and `browser check` already expose the required state/action/component-health contracts. `doctor --json` remains useful diagnostic evidence but its aggregate `ok` field includes unrelated checks and is not authoritative for recovery PASS.
- **Smallest proposed repair:** implemented as the single repo-local skill above. No runtime source/config change, caller kill, drain fence, lifecycle reset, retry framework, supervisor, or Goose-state manipulation was added.
- **Required deterministic regression tests:** skill discovery/parse via `goose skills list`; source/contract review of current command spelling and cancellation semantics; `git diff --check`. No live cancellation or BrowserHost qualification from a ChatGPT-Web-backed session.
- **Out-of-band runtime testing required:** YES. OOB-005 should run from one fresh non-affected agent on the next real retained/re-admission incident (do not manufacture one), invoke the skill exactly as written, and prove PASS/BLOCKED from authoritative state. The existing ecological three-call cleanup is supporting evidence, not a substitute for packaged-skill qualification.
- **Correct PR/workstream:** PR #31 operational hardening or a tightly scoped follow-up.
- **Recommended next action:** perform OOB-005 at the next genuine abandoned retained-turn incident; do not run a synthetic spinout merely to exercise the skill.

### CGW-006 — Goose OpenAI provider total-request deadline cancels active Responses streams at 600 seconds

- **Class:** confirmed upstream provider-client defect
- **Final classification:** OWNER-IDENTIFIED; SOURCE-FIRST STOP MET; IMPLEMENTATION NOT RUN
- **User impact:** Goose can report `Network error: Stream decode error: error decoding response body` while an otherwise healthy ChatGPT-Web browser turn is still active. The transport failure terminates the Goose reply loop and asks the user to resend even though the failure was caused by a caller-side elapsed-time deadline rather than a daemon/body-decode defect.
- **Frequency / severity:** three natural finalized traces are now source-correlated to the same 600-second clock. Severe for long individual provider responses and for long logical tasks that eventually contain one provider response lasting at least 600 seconds.

**CONFIRMED**

- The installed Goose is `1.45.0`. Its active provider is `custom_chatgpt_web__local_1`, a custom provider with `engine: "openai"`, `base_url: "http://127.0.0.1:17841"`, `base_path: "v1/responses"`, streaming enabled, and `timeout_seconds: null`.
- Exact installed-source owner: Goose tag `v1.45.0` (`4dc0420f5704a92806c6628c8f0a3497d7a88759`), `crates/goose-providers/src/openai.rs`. The custom OpenAI provider defines `DEFAULT_TIMEOUT_SECONDS: u64 = 600`, resolves `config.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS)`, and passes that duration to `ApiClient::with_timeout_and_tls(...)`.
- Exact HTTP-client breadcrumb: Goose `crates/goose-providers/src/api_client.rs`. `ApiClient::with_timeout_and_tls(...)` constructs reqwest with `Client::builder().timeout(timeout)` and preserves the same total timeout when rebuilding the client.
- Exact timer semantics: Goose `v1.45.0` resolves `reqwest` `0.13.4`. In that reqwest source, `ClientBuilder::timeout(...)` is explicitly a **total request deadline** from the start of connecting until the response body has finished. `TotalTimeoutBody` explicitly does **not** reset on each response-body chunk. Reqwest separately exposes `read_timeout(...)`, whose clock does reset after each successful read; Goose is not using that mechanism for this 600-second setting.
- The 600-second clock therefore starts for each new Goose HTTP provider request when that request starts connecting. It does not reset on SSE activity, heartbeat frames, browser progress, or any other activity within that HTTP response. A tool result/provider continuation can lead Goose to start a **new** HTTP request, which gets a fresh 600-second deadline; that is a new request, not an activity reset of the previous deadline.
- The repo daemon does not create the 600-second timer. `src/server.ts` receives the Bun HTTP request's `req.signal`; when the caller disconnects it records `request-signal-abort`, records `cancellationSource=request-signal`, and only then propagates that cancellation through its own adapter `AbortController`. `HttpTurnCounter` consequently records `client-cancellation`. The recorder event is the downstream observation of Goose/reqwest ending the HTTP body, not the source of the timer.
- Goose ACP is not the 600-second owner. `crates/goose/src/acp/server.rs` creates an explicit `CancellationToken` for a prompt run and passes it into `agent.reply(...)`; the prompt stream is consumed without a matching 600-second timeout wrapper. A source search found no 600-second ACP/Desktop prompt deadline.
- Goose's current upstream `origin/main` at `3810898a7447ec3299be72e223d3570a7aabf0ab` still carries the same 600-second OpenAI/default provider timeout construction, so this is not already repaired upstream.
- The user-visible `Stream decode error` is an outer error-classification artifact. `stream_responses_compat(...)` consumes `response.bytes_stream()` and maps a body-stream failure through the generic streaming decoder; `ProviderError::stream_decode_error(...)` renders it as `Network error: Stream decode error: ...`. That text does not establish a daemon decoder defect.

Natural case reconstruction:

| Goose session | trace | failed Responses request start | request-signal abort | last successful SSE/body activity | prior broker work | browser/daemon settlement |
| --- | --- | --- | --- | --- | --- | --- |
| `20260814_24` | `4c995549362e` | `2026-08-14T17:33:00.023Z` | `599911 ms` at `17:42:59.933Z` | SSE enqueue `598860 ms`; body chunk `598869 ms`; 239 frames / 232 heartbeats | 42 broker calls completed, 0 unresolved; last completion `17:33:00.023Z` | request body settled as `client-cancellation` at `599912 ms`; adapter `AbortError`; failed surface released `turn-end-aborted` ~3.2 s later; no abnormal process event |
| `20260815_25` | `022984c74576` | `2026-08-15T19:25:20.371Z` | `600013 ms` at `19:35:20.384Z` | SSE enqueue `598247 ms`; body chunk `598251 ms`; 239 frames / 238 heartbeats | 37 broker calls completed, 0 unresolved; last completion `19:25:20.371Z` | request body settled as `client-cancellation` at `600051 ms`; adapter `AbortError`; failed surface released `turn-end-aborted` ~2.2 s later; no abnormal process event |
| `20260816_11` | `ea9d46d1a1b7` | `2026-08-16T11:22:52.090Z` | `599958 ms` at `11:32:52.048Z` | SSE enqueue `598994 ms`; body chunk `599015 ms`; 239 frames / 238 heartbeats | 72 broker calls completed, 0 unresolved; last completion `11:22:52.124Z` | request body settled as `client-cancellation` at `599963 ms`; adapter `AbortError`; BrowserHost released cleanly as `turn-end-aborted` ~3.0 s later and the runtime naturally returned to `0/0`; no abnormal process event |

- All three are governed by the same clock: each failed request is the final request in a trace containing many earlier successful Responses continuations (42/37/72 normal completions respectively), each abort lands at the configured reqwest 600-second total deadline, and successful body activity continues to roughly 598–599 seconds without extending that deadline.

**INFERENCE**

- The historical “~603–606 seconds after the last tool-result continuation” observation is the same 600-second provider-request deadline plus recorder/cancellation propagation overhead, not a separate browser, broker, daemon, or Goose-turn timer.
- The user can perceive failures after roughly 20–40 minutes of useful logical work because the 600-second clock is **per provider HTTP request**, not per Goose session or trace. Earlier tool calls/Responses continuations can complete successfully for many minutes; only the later individual request that remains open for 600 seconds is cancelled. The latest trace, for example, performed 72 successful broker/tool continuations before the 73rd Responses request hit the deadline.
- The correct architecture is a combination: remove the invalid absolute elapsed-time assumption from the streaming provider transport, while keeping Goose as the owner of the hours-long logical task. Goose's native reply loop already persists conversation/tool results, automatically starts successive provider executions, auto-compacts persisted conversation state, honors explicit cancellation, and is action-count bounded (`DEFAULT_MAX_TURNS = 1000`) rather than carrying a 600-second logical-turn deadline.
- The narrow repair belongs upstream in Goose's OpenAI/provider HTTP client path, not in ChatGPT-Web, Electron/BrowserHost, the tunnel, or Goose Control. For streaming Responses bodies, use reqwest's native no-total-deadline behavior plus bounded connect/setup and, if desired, true read/inactivity timeout semantics. Explicit caller cancellation remains authoritative. Do not reinterpret browser/SSE heartbeats as artificial keepalive work.

**UNKNOWN**

- Exact upstream patch shape remains a maintainer-facing implementation choice: a streaming-specific `ApiClient` request mode/client versus a more general timeout-policy abstraction. The patch must not silently reinterpret existing `timeout_seconds` semantics for unrelated non-streaming providers.
- Whether Goose should enable a finite read/inactivity timeout by default for streaming Responses, and its value, is not established here. Reqwest already provides the correct reset-on-successful-read primitive; no new elapsed-time heuristic is needed.
- Whether causal preservation of the underlying reqwest timeout/network error through the streaming decoder should ship in the same patch or a tiny follow-up remains to be decided. It is desirable but not required to localize the 600-second owner.

- **Overlap / dependency:** CGW-006 can still amplify CGW-004 if a human manually resends after the false network failure while older work is settling, but concurrency is not the cause of this timer. Distinct from BrowserHost liveness and CGW-009.
- **Current implementation / fix status:** not fixed in this repo and not fixed in current Goose upstream. No product code was changed in this planning pass.
- **Activated runtime contains relevant repair:** NO.
- **Can existing evidence specify the repair architecture?** YES. It proves removal of an invalid absolute total-stream deadline; it does **not** justify replacing `600` with a larger number.
- **Required deterministic regression tests:** in Goose provider tests, use a hermetic local Responses SSE server and a scaled-down configured deadline (for example 1 second) so the test crosses the old total deadline quickly while emitting valid chunks more frequently than any inactivity timeout. The repaired streaming path must remain connected and complete after the old deadline; a separate stalled-body case must still trip any selected read/inactivity policy; explicit cancellation must still terminate immediately. No ChatGPT/Electron/tunnel runtime is required.
- **Out-of-band runtime testing required:** NO for source localization. OOB-006's source-first stop condition is satisfied; do not run a 10+ minute ChatGPT or mock test merely to reconfirm the three natural incidents.
- **Correct PR/workstream:** upstream Goose OpenAI/provider-client transport, with this repo retaining only the evidence/register update unless an upstream Goose change must later be vendored or pinned.
- **Recommended next action:** prepare the narrow upstream Goose implementation with the hermetic scaled-deadline SSE regression above, preserving explicit cancellation and causal errors. Do not change `600 -> 7200`, add periodic browser rotation/restart, synthesize keepalive traffic, or create a second orchestration loop.

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
- **Final classification:** NEEDS-OUT-OF-BAND-TEST; OOB-009 REMAINS REQUIRED
- **User impact:** ChatGPT can begin generation after receiving the prompt while the local `send` stage times out, causing Goose to report failure despite a live useful remote execution.
- **Frequency / severity:** one strong historical natural case plus later send-stage timeouts with weaker/closed-target evidence; severe when it occurs.
- **Exact supporting evidence:** `docs/chatgpt-web-reliability-closeout.md`; current `src/adapters/chatgpt-web/browser-worker.ts`; current `launcher/electron/browser-host.cjs`; raw trace `~/.goose-chatgpt-web-dev/observations/2026-08-14/4f823b086f9c`; and the matching Electron launcher records in `~/Library/Logs/Codex Web GPT/launcher.jsonl`. Current source still awaits `sendButton.press("Enter")` **before** starting `waitForSubmissionAccepted()`, whose `user_turn` / `assistant_turn` / `generation_running` checks are all Playwright page operations on the same control lane. The BrowserHost heartbeat currently exposes renderer lifecycle only, and existing native network recording is failure-only for owned turn surfaces; the separate successful backend-response listener is scoped to the BrowserHost home WebContents rather than turn tabs.
- **Current root-cause confidence:** high that the sequential acknowledgement gap exists and that the historical accepted-but-unacknowledged class is distinct from the fixed diagnostic-overlap defect; medium that it remains a frequent post-`7f99` ecological cause.
- **CONFIRMED:** trace `4f823b086f9c` used surface `sPkLadBb4OBTRN0IgJ9gVB6lW25K-ZdD` / renderer `72565` with `maximumActiveBrowserTurns=1`. The file-attachment diagnostic had completed with no outstanding diagnostic before `send-press-start` at `2026-08-14T14:47:01.509Z`. While that press remained unresolved, BrowserHost independently recorded same-surface native navigation load-start/load-stop at `14:47:04.707Z` / `14:47:05.195Z`, and a retained native frame is timestamped `14:47:04.964Z`; the reliability closeout independently records the post-press native screenshots as showing ChatGPT generating. Renderer heartbeats remained `active` / `created` through the stall. The send stage timed out at `14:47:30.810Z`; the underlying action then late-settled as a rejection at `14:47:32.607Z`. The surface was released as error at `14:47:40.462Z`, the retry lineage opened without another browser attempt, and Responses emitted `response.failed` while its outer body closed normally. The only mapped native network failure in this trace occurred at `14:46:52.203Z`, before send dispatch, so it cannot prove send acceptance.
- **INFERENCE:** the smallest promising authoritative candidate is a successful BrowserHost-native network event for the exact submission request, correlated through the already-owned turn WebContents/surface/trace and observed independently of Playwright. The current code does not record such an event for turn tabs, so one isolated OOB-009 sample must establish the exact request boundary and whether its successful response/start semantics are sufficient. The same-surface native navigation seen in `4f823b086f9c` is useful independent progress evidence but is not, by itself, logically specific enough to prove submission acceptance.
- **UNKNOWN:** the exact stable native request/event that marks acceptance in the current ChatGPT renderer, whether it remains observable before a deliberately stalled Playwright press acknowledgement, and whether a successful request event alone is sufficient or must be paired with a stronger native generation signal. If no such signal exists, the provider needs an explicit post-dispatch indeterminate-submission settlement that forbids automatic resubmission and preserves the causal send-control error.
- **Overlap / dependency:** distinct from CGW-015 fixed diagnostic overlap; should be tested after CGW-004's overlap provenance is cleaner.
- **Current implementation / fix status:** remaining gap not repaired.
- **Activated runtime contains relevant repair:** contains the diagnostic-overlap repair, not a dedicated send-indeterminate settlement repair.
- **Can existing evidence fully specify a fix?** NO. Existing DOM/generation evidence is same-lane; native lifecycle/navigation evidence is insufficiently specific; successful turn-submission network telemetry is not currently recorded.
- **Smallest proposed repair if YES:** N/A until OOB-009 proves an authoritative independent acceptance signal. If it does not, implement only the conservative indeterminate-submission settlement described above; never retry Enter merely because its acknowledgement timed out.
- **Required deterministic regression tests:** once signal is selected: press acknowledgement stalls after actual submission; chosen independent acceptance signal resolves success; no second Playwright control operation overlaps the stuck press; genuine non-submission still preserves original timeout/error.
- **Out-of-band runtime testing required:** YES, packet OOB-009.
- **Correct PR/workstream:** PR #31.
- **Recommended next action:** run exactly one isolated OOB-009 discriminating experiment against the existing BrowserHost-native network boundary; do not implement the causal repair until that sample proves or disproves the candidate.

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
| Two ChatGPT windows during one Goose turn | CGW-004; CGW-006 only when ~600s cancellation is separately present | The strongest historical overlaps are an ordinary provider execution plus Goose-owned background tool-pair summarization, each with a distinct execution key/surface. Same-session overlap alone is valid concurrency, not retry duplication. |
| Repeated close/reopen/retry / retained active browser turns / 12-turn spinout | CGW-004 only as concurrency context, operationally CGW-005 | Multiple valid Goose operations can expose multiple failure surfaces; supported cancellation is recovery, not cause/fix. Diagnose any retained-turn defect against the owning operation rather than session identity. |
| `Network error: Stream decode error` near 603–606s | CGW-006 | Current recorder localizes cancellation to the caller at ~600s; no daemon body-decode error is recorded. |
| Broker timeout / orphaned tool state | CGW-007, sometimes downstream of CGW-006/004 | Not enough clean evidence for a separate current broker fix. |
| `Connection interrupted. Waiting for the complete answer` | CGW-008 | Ecological UI symptom; no current recorder occurrence. |
| Prompt accepted / generation starts but local send fails | CGW-009 | Separate from the fixed diagnostic-overlap incident CGW-015. |
| ~560–579k prompt failures | CGW-010, with CGW-004 as concurrency context only | Strong size correlation remains, but the reconstructed large members are ordinary Goose turns overlapping tool-pair summarization, not stock compaction. Do not call size/attachment causally proven until CGW-010 is isolated. |
| Short `@g`, polluted menu, missing connector row | CGW-001 | Repaired by `a98ab0d`; observe only. |
| True BrowserHost absent when provider is first needed | CGW-011 | PR #33 design boundary, not CGW-003 stale replay. |
| Actual reboot/login not proven | CGW-012 | Validation gap, not evidence of a lifecycle defect. |
| `bun run verify` opens headed Chrome | CGW-013 | Validation/support split; managed-Chrome compatibility remains supported. |
| Parent+2 child overlap but unreliable completion | CGW-014 | Late qualification; do not use current mixed failures as a concurrency root cause. |

## 4. READY-FOR-FIX queue

### RF-1 / CGW-002 — Namespace standalone execution identity by trusted Goose session — DONE, see CGW-002 (FIXED / OBSERVE)

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

### RF-2 / CGW-003 — Make explicit pre-lease BrowserHost availability errors retryable/non-poisoning — DONE, see CGW-003 (FIXED / OBSERVE)

**Implementation packet**

1. Define a narrow structured adapter error boundary for launcher descriptor/process/control/helper readiness failures that occur before a turn surface is leased.
2. Preserve original causal text/cause and use one stable code; mark only this explicit infrastructure family retryable.
3. Reuse existing retryable session retirement and bounded retry-circuit behavior. Do not add retries or raise timeout counts.
4. Add deterministic tests: fail-then-success exact key starts a second runtime; fail-twice opens existing circuit; unrelated generic errors remain terminal/replayable; original cause survives.
5. No live descriptor deletion/reproduction is required.

### RF-3 / CGW-005 — Package the already-proven recovery procedure — DONE; OOB qualification tracked as OOB-005

**Implemented packet**

1. Reconciled current CLI/service semantics: `/healthz` owns authoritative turn counters, and `codex-chatgpt-web service cancel-turns` is the supported cancellation action.
2. Added `.agents/skills/chatgpt-web-runtime-recovery/SKILL.md` with strict out-of-band trigger, deterministic state verification, a three-call total cancellation budget for state-proven caller re-admission, PASS/FAIL/BLOCKED outcomes, stop boundary, prohibited actions, and evidence preservation.
3. Did not add an `AGENTS.md` activation rule because current Goose skill discovery finds the repo-local skill automatically via `goose skills list`.
4. Kept recovery separate from diagnosis and added no process-kill, restart, drain-fence, retry, supervisor, or caller-control machinery.
5. Validate discovery/structure only; live runtime qualification is OOB-005 and must not run from the ChatGPT-Web-backed implementation session.

### RF-4 / CGW-013 — Split hermetic verification from explicit managed-Chrome compatibility smoke

**Implementation packet**

1. Preserve `managed-chrome` as a supported BrowserHost mode and retain its release/compatibility smoke.
2. Refactor release smoke so the live Darwin `browser check` is explicitly opted into rather than an implicit part of ordinary `bun run verify`.
3. Keep default verification build/type/test/release-artifact checks browser-free.
4. Update CI/release to call the explicit managed-Chrome check deliberately so coverage is not lost.
5. Add a deterministic command/argument test where practical; do not validate this change by launching a browser from a self-hosted turn.

## 5. NEEDS-OUT-OF-BAND-TEST queue

### OOB-004 / CGW-004 — CLOSED; existing evidence identifies the purpose of same-session overlapping executions

- **Result:** no new runtime experiment is required. The strongest historical pairs are ordinary Goose provider turns overlapping Goose's intentionally spawned tool-pair summarization batch, not stock-compaction/ordinary overlap and not retry amplification.
- **Owning operation:** `stream_response_from_provider(...)` owns the ordinary turn; `maybe_summarize_tool_pairs(...)` owns the background `complete_fast(...)` requests. Both intentionally reuse the same Goose session identity while retaining distinct provider execution keys.
- **Stop boundary satisfied:** exact operation ownership is established from Goose 1.45.0 source, historical Goose CLI operation logs, session metadata, and the existing flight-recorder timelines. Do not run a replacement live qualification merely to reconfirm it.
- **If a future different pair is ambiguous:** capture Goose-native operation identity if Goose exposes it; otherwise add only the smallest passive authoritative field available. Do not infer purpose from prompt length and do not serialize by `agent-session-id`.

### OOB-005 / CGW-005 — Qualify the packaged recovery skill on the next real abandoned spinout

- **Exact question:** Can a fresh out-of-band agent use the packaged skill to restore and prove clean idle without acquiring caller authority or restarting infrastructure, including the bounded caller re-admission branch?
- **Preconditions:** a genuine retained/replacement-surface incident has already occurred; the affected logical work is explicitly abandoned; the qualifying agent is fresh and does not depend on the ChatGPT-Web runtime being recovered. Do not manufacture a spinout just for this proof.
- **Allowed actions:** apply `.agents/skills/chatgpt-web-runtime-recovery/SKILL.md` exactly; read only projected `/healthz` recovery fields; run `codex-chatgpt-web service cancel-turns` only when state requires it and at most three times total; after `0/0` is observed use canonical `tunnel status` when required by the configured mode, read-only `lifecycle status`, and `browser check` for required component health; capture `codex-chatgpt-web doctor --json` only as supporting diagnostics; preserve existing trace/error identifiers.
- **Prohibited actions:** no lifecycle/service/tunnel/BrowserHost restart or stop; no process kill; no Electron window manipulation; no failed-task replay/continuation; no source/config edit; no credentials/Keychain/Goose-SQLite inspection; no diagnosis in the recovery run.
- **Exact observations to capture:** preflight and final `active_http_turns` / `active_browser_turns` / `accepting_turns` / daemon status; every `cancelledBrowserTurns` output; whether counters reappeared after a cancellation; canonical tunnel runtime readiness when applicable; `lifecycle status` BrowserHost readiness; `browser check` success; `doctor --json` aggregate/component diagnostics; whether any process/service was restarted.
- **PASS:** authoritative `0/0` is observed with daemon `status=ok` and `accepting_turns=true`; the required tunnel is canonically running/healthy/ready; BrowserHost readiness and browser authentication/reachability checks pass; and a second `/healthz` read remains healthy `0/0`, all within the three-cancellation action budget. Aggregate `doctor.ok` is not a PASS gate.
- **BLOCKED:** caller browser re-admission continues after the third cancellation; HTTP-only activity remains after browser cancellation and the supported health bracket; or the agent cannot safely establish out-of-band/abandoned-work preconditions. For repeated browser admission report `cancellation succeeded but caller is still re-admitting work`; do not keep cancelling.
- **FAIL:** supported cancellation fails, authoritative daemon health is unavailable/malformed/unhealthy, or a required tunnel/BrowserHost/browser component-specific health check fails after clean `0/0` state. Unrelated doctor diagnostics do not by themselves turn successful cleanup into FAIL.
- **Stop boundary:** one real incident, one skill invocation, no diagnosis or follow-on fix. Successful qualification may close the implementation-validation gap; any BLOCKED/FAIL result returns to a fresh planner with preserved evidence.

### OOB-006 / CGW-006 — Locate the approximately 600-second outer deadline — NOT REQUIRED (source-first stop met)

- **Disposition:** CLOSED WITHOUT LIVE OOB EXECUTION. Installed Goose `1.45.0` source proves H1: the active custom OpenAI provider resolves its unset timeout to 600 seconds and constructs reqwest with a total request/body deadline. Reqwest source proves that deadline does not reset on body chunks. The three natural recorder traces land on that clock.
- **Exact question:** Which outer Goose/provider/client component cancels an otherwise active streaming Responses request at ~600s despite SSE heartbeat activity? **Answered: Goose OpenAI provider `ApiClient` / reqwest total request timeout.**
- **Remaining hypotheses:** none for ownership. Patch-shape/read-inactivity policy remains an implementation choice, not an OOB localization question.
- **Preconditions:** out-of-band executor; no ChatGPT runtime manipulation required.
- **Allowed actions:** source inspection only was needed and is complete. A local mock remains available solely as an implementation regression technique, not as localization evidence.
- **Prohibited actions:** no global timeout increase; no retry changes; no live ChatGPT request; no BrowserHost lifecycle action.
- **Exact observations captured:** installed/current Goose source/config owner, reqwest total-deadline semantics, exact natural request-abort timing, last successful SSE/body activity, caller-cancellation propagation, and user-visible error classification.
- **Expected interpretation:** satisfied by source proof; no localization mock is needed.
- **Stop boundary:** source proof of the exact 600s deadline is sufficient; met on 2026-08-16. No implementation was performed in this pass.
- **Compact return contract:** satisfied by CGW-006 above. Next work is the upstream Goose implementation packet, not OOB-006.

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

1. **CGW-006** — ~600s cancellation: result decides repo-local vs Goose client fix and must not become a blind timeout increase.
2. **CGW-009** — send acknowledgement: result decides which independent acceptance signal, if any, can be used without reintroducing overlapping Playwright control.
3. **CGW-010** — large context: result decides whether PR #32 externalization is justified now that CGW-004's overlap provenance is identified as valid Goose tool-pair summarization concurrency.
4. **CGW-011** — PR #33: a fresh planner must first reconcile the current Goose provider/application lifecycle API with the documented ownership boundary before implementation.

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
3. **CGW-005 — recovery skill.** IMPLEMENTED; keep OOB-005 as the single remaining packaged-skill qualification, using the next real abandoned incident rather than a synthetic spinout.
4. **CGW-004 — identified valid Goose concurrency; no serialization fix.** Preserve distinct operation identity. Reopen only for a separately proved settlement/cancellation invariant violation, not because two surfaces share `agent-session-id`.
5. **CGW-009 — send acceptance indeterminacy.** Once overlap provenance is clean, isolate accepted-but-unacknowledged sends without overlapping Playwright controls.
6. **CGW-006 — outer ~600s cancellation.** This can run independently using Goose source/local mock, but implementation placement should follow clean provider settlement evidence.
7. **CGW-010 / PR #32 — isolated context-size experiment, then planning.** Same-session overlap is now understood; implement externalization only if isolated causal evidence supports it.
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
