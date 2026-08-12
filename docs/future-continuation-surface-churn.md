# Future investigation — continuation surface churn after post-send control failure

Status: **deferred reliability investigation; documentation/design only.**

Captured from a live ordinary-Goose / ChatGPT-Web failure on **2026-08-12** while Goose was being used for Goose Control work. This note exists so the next dedicated reliability chat can start from the observed production-path failure rather than rediscovering earlier continuation, Electron, or managed-Chrome history.

## User-visible failure

A follow-up prompt in an existing Goose session failed with:

```text
Request failed: Responses API failed: Object {"message": String("ChatGPT browser/CDP control path became unresponsive after the message was sent."), "type": String("server_error"), "code": String("chatgpt_browser_control_unresponsive")}.
Please retry if you think this is a transient or recoverable error.
```

The failure happened **after the follow-up message had been sent to ChatGPT**.

## Browser behavior observed live

The Electron BrowserHost window showed a repeatable sequence during the failed continuation:

1. the follow-up Goose prompt caused another ChatGPT Temporary Chat surface/tab to appear while a prior Electron task tab was still visible;
2. the new tab contained the actual follow-up prompt and ChatGPT began acting on it;
3. ChatGPT reached the `Goose Native` connector and attempted to inspect/use its capabilities;
4. the ChatGPT UI displayed:

   ```text
   Goose Native
   No data returned
   This app returned no data.
   ```

5. that browser tab was then closed;
6. another fresh Temporary Chat tab opened and replayed the same follow-up work;
7. the close → fresh-tab → replay pattern repeated until the Responses request ultimately surfaced `chatgpt_browser_control_unresponsive`.

A screenshot captured one of the replayed tabs. The assistant text visible immediately before the failed connector result was conceptually:

> I’m going to inspect the available Goose Native capabilities first, then continue the existing Day Shift session without making code changes.

The key evidence is not merely that a new Electron tab existed. The current architecture intentionally allows a fresh ChatGPT Temporary Chat for a new logical Goose user turn. The suspicious behavior is the **surface overlap/churn plus repeated replay of the same follow-up request after a post-send failure**, followed by `Goose Native` returning no data.

## Important continuation invariant

Do **not** “fix” this by forcing physical reuse of the previous ChatGPT browser tab/chat.

The already-proven Goose continuation model is:

```text
persisted Goose session
  → later Goose user turn / --resume
  → Goose supplies durable accumulated context
  → provider may use a fresh ChatGPT Temporary Chat surface
```

Goose is the durable conversation source of truth. A fresh browser surface for a later Goose user turn is expected.

The investigation must instead determine why the second turn becomes unhealthy, why prior/new surfaces overlap or churn, and what component reissues the failed request.

## Current code evidence on main

Baseline when this note was created:

```text
40c29bfc59f6e51f1742784824110cd53e907de7
Reconcile runtime and Goose Control documentation
```

### Post-send browser-control liveness

`src/adapters/chatgpt-web/control-liveness.ts` currently probes browser control after submission with:

- probe interval: 5 seconds;
- each probe timeout: 3 seconds;
- terminal threshold: 2 consecutive failed probes.

The probe used by the browser worker is currently:

```ts
page.evaluate(() => document.readyState)
```

After two consecutive failed probes the watcher throws a retryable `ChatGptWebAdapterError`:

```text
status: 502
type: server_error
code: chatgpt_browser_control_unresponsive
retryable: true
```

### Browser worker does not itself replay the turn

`ChatGptBrowserWorker.run()` registers one promise per `traceId`. `runBrowserTurn()` races the response watcher against the post-send control-liveness failure. If liveness wins, the turn fails and the `finally` path attempts to release/close that turn's launcher browser connection.

There is **no retry loop in `runBrowserTurn()` that intentionally opens another fresh Temporary Chat after this error**.

Therefore the repeated fresh Electron tabs observed after the retryable 502 are strong evidence that the request is being submitted again **above the browser-worker turn**, for example by the Responses/provider/Goose request layer. The exact retry owner is not yet proven and must be traced rather than assumed.

### Concurrent Electron surfaces are supported intentionally

The BrowserHost/worker design permits multiple simultaneous independent ChatGPT-Web turns (bounded by the browser-tab cap). Therefore the solution must not globally serialize Electron or remove legitimate parallelism merely to suppress this failure. Independent future subagents require real concurrent surfaces.

## Primary diagnostic questions

Answer these in order before changing behavior.

### 1. Which component reissues the continuation request?

Correlate one failed follow-up across:

- Goose/provider request;
- Responses daemon request/trace identity;
- native Goose/Codex turn metadata used for replay/continuation;
- browser-helper request ID;
- BrowserHost `traceId` / `surfaceId`;
- any outer retry/backoff event.

Determine whether the repeated tabs are caused by:

- Goose provider retries;
- Responses-daemon retries;
- helper/client retries;
- another higher-level request replay.

Do not infer this only from the fact that the adapter error is marked `retryable: true`.

### 2. What is the exact prior-surface cleanup timeline?

For the first successful Goose turn and the failing second turn, record:

```text
turn terminal/completed
→ helper connection cleanup
→ BrowserHost turn/end or equivalent release
→ WebContentsView removal
→ next logical turn lease
```

Determine whether the prior completed surface is actually leaked/delayed, or whether the visual overlap is a short legitimate handoff while cleanup finishes.

Do not require zero milliseconds of overlap unless the ownership contract actually requires it.

### 3. Is the post-send `page.evaluate(document.readyState)` failure a true renderer/control loss?

At the failing moment, correlate existing evidence without adding a second normal CDP observer:

- BrowserHost control endpoint health;
- exact leased surface existence;
- renderer crash/unresponsive events if exposed;
- helper heartbeat;
- existing browser-turn diagnostics;
- visible ChatGPT UI progress;
- Goose Native connector state;
- optional centrally owned Electron network evidence if resumed together with PR #27.

The screenshot shows a rendered, interactive-looking ChatGPT state near the connector call. That makes a false-positive or partial-control-path failure plausible, but it is **not yet proof** that `page.evaluate` was the wrong signal.

### 4. Why does `Goose Native` return no data on the replayed turn?

Trace the connector/MCP/broker path without logging secret token values.

Verify for each attempt:

- a valid turn-scoped Goose Native capability exists;
- the connector call maps to the intended active Goose turn;
- the capability is not already revoked because the prior browser attempt failed;
- native turn metadata/response replay identity is preserved correctly;
- the Secure MCP Tunnel still owns a live matching MCP child;
- the broker either returns a real tool call/result or a precise error rather than an empty/no-data response.

Determine whether `No data returned` is:

- a consequence of retrying an already-failed/revoked browser turn;
- a turn-token/binding mismatch;
- an MCP/tunnel response failure;
- ChatGPT connector-side behavior;
- unrelated to the browser-control error.

### 5. Should this failure be retryable at the outer request boundary?

The current adapter labels `chatgpt_browser_control_unresponsive` retryable. A blind replay of a **tool-capable prompt that was already submitted** may not be semantically safe if ChatGPT or Goose Native performed side effects before control was lost.

Investigate whether the correct contract is:

- retry only before send acceptance;
- retry after send only when execution is known idempotent and no tool side effect occurred;
- return an explicit ambiguous/unknown-outcome error after post-send control loss;
- or recover/reacquire the same owned surface without resubmitting the user prompt, if the existing BrowserHost/helper architecture can do so safely.

Do not choose one without tracing the real retry owner and turn state first.

## Leading hypotheses — not conclusions

Rank only after collecting correlated evidence.

1. **Post-send liveness false positive / partial CDP stall.** `page.evaluate(document.readyState)` may fail twice while the renderer/UI/connector is still doing useful work, causing a healthy-enough turn to be declared dead.
2. **Higher-level blind replay after retryable 502.** The failed request is resubmitted above the browser worker, producing a new leased surface and replaying the same already-sent prompt.
3. **Capability lifetime mismatch on replay.** The first browser attempt fails and revokes/releases turn-scoped authority; a replay then reaches `Goose Native` with state that no longer maps cleanly to the intended Goose tool round, producing `No data returned`.
4. **Real helper/CDP wedge during connector/tool UI transition.** The UI may remain visibly rendered while the automation/control channel itself is genuinely stuck.
5. **Delayed prior-turn surface release.** The first tab may remain visible past logical terminal state and overlap the second turn, confusing user observation or exposing a real cleanup race.

More than one may be true.

## Required evidence for the future investigation

Use one minimal disposable persisted Goose session and capture a single failure with correlated IDs/timestamps.

Minimum useful evidence:

- first-turn Goose session ID/name;
- second-turn request identity;
- daemon trace ID(s);
- browser-helper request ID(s);
- BrowserHost surface IDs and start/end timestamps;
- post-send liveness probe failures;
- cleanup/release events;
- outer provider retry events;
- Goose Native tool-call/broker lifecycle, with secrets redacted;
- existing browser-turn diagnostic JSON/screenshots for the failing trace.

Prefer existing structured logging/diagnostics. Add narrowly scoped correlation logging only if the current evidence cannot answer the ownership question.

Do **not** add a second Playwright/CDP observer as a normal diagnostic dependency. Previous Electron qualification showed that extra observers can change the failure being investigated.

## Repair constraints

Do not solve this with:

- arbitrary sleeps;
- generic retry loops;
- globally disabling the post-send liveness watcher;
- forcing all Electron turns to serialize;
- persistent reuse of one ChatGPT browser conversation across Goose user turns;
- restoring managed Chrome;
- moving Goose session ownership into the browser bridge;
- moving daemon/tunnel ownership into Electron;
- weakening Goose Native turn-token/capability isolation;
- swallowing a post-send ambiguous failure and claiming success.

Any repair must preserve legitimate concurrent surfaces for independent Goose turns/subagents.

## Qualification ladder after a fix

### A. Plain continuation

Use a named persisted ordinary Goose session:

1. first prompt returns a known value;
2. separate later `--resume` asks a dependent question;
3. dependent answer proves Goose context continuity.

Require:

- no repeated surface replay/churn;
- no `chatgpt_browser_control_unresponsive`;
- previous terminal surfaces are released according to the documented BrowserHost contract;
- a fresh Temporary Chat for the new logical Goose turn is accepted as normal.

### B. Three consecutive dependent Goose turns

Run first turn + two later dependent resumptions.

Require each logical user turn to complete exactly once from Goose's point of view, with no accidental duplicate prompt execution.

### C. Tool-capable continuation

Repeat using one harmless Goose Native read-only/tool action in the continued turn.

Require:

- real connector result;
- no `No data returned`;
- correct turn-scoped authority;
- no retry replay after send.

### D. Original Goose Control workload

Only after A–C pass, retry the workflow that originally exposed this failure.

Goose Control itself is not the transport fix; it is a useful realistic continuation workload that happened to reveal the provider/browser defect.

### E. Concurrency regression check

After fixing continuation reliability, separately confirm that two intentionally independent ChatGPT-Web turns can still overlap. Do not let a continuation fix accidentally destroy the BrowserHost's deliberate bounded concurrency needed for future ChatGPT-Web subagents.

## Relationship to other work

- **PR #27** (`future Electron turn observability`) is broader and may provide useful renderer/network evidence. This continuation failure is specific enough to own its own diagnosis and acceptance proof.
- **PR #28** is naming/documentation planning only and must not be used to mix mechanical renaming into this reliability fix.
- **Goose Control** belongs in Day Shift. The failure occurred while working on Goose Control, but the defect is in the `goose-chatgpt-web` provider/browser continuation path.
- **ChatGPT-Web subagent qualification** should remain separate. A fix here must preserve intentional multi-surface concurrency rather than serializing the BrowserHost.

## Stop boundary

This document does not authorize implementation from an active ChatGPT-Web turn that would need to replace/restart the same BrowserHost/daemon carrying that turn.

A future planning chat should first inspect the current local runtime/log evidence and identify the exact retry owner. If the repair requires changing/restarting the live ChatGPT-Web transport, use an independent provider/specialist session for that implementation/proof boundary.
