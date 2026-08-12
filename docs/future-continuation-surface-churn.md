# Future investigation — cross-transport Goose continuation failure and retry churn

Status: **deferred reliability investigation; documentation/design only.**

Captured from live ordinary-Goose / ChatGPT-Web failures and historical user observation on **2026-08-12**. This note exists so the next dedicated reliability chat starts from the actual repeated failure pattern rather than treating it as an Electron-only regression.

## Critical historical correction

The important new evidence is that **ordinary follow-up prompts in the same Goose chat have never been reliably successful in this project**, including under the previous managed-Chrome transport.

Observed user-level pattern across both browser transports:

```text
fresh Goose chat, first prompt
  → works

same Goose chat, second/follow-up prompt
  → fails

close the stuck browser tab manually
  → start a completely fresh Goose chat
  → first prompt works again
```

Therefore the current Electron failure must **not** be framed primarily as an Electron continuation bug.

The common denominator is the shared Goose → custom Responses provider → Responses daemon / logical-turn / Goose Native continuation path. Electron makes the failure much more visible because its task-bound surfaces can be watched as they overlap, close, and reopen, but managed Chrome exhibited the same user-facing inability to continue a Goose conversation.

This materially lowers the probability that Electron `WebContentsView` lifecycle is the root cause and raises the priority of investigating shared continuation/session identity, broker/capability lifetime, request retry semantics, and stale browser-turn state common to both transports.

## Reconcile this with earlier narrow continuation proofs

Current documentation records narrow dependent `--resume` proofs as having passed at specific checkpoints. The user's broader operational evidence now conflicts with treating continuation as generally qualified.

Do not erase the narrow proofs, but do not let them outrank the repeated real workflow evidence either.

The future investigation must determine exactly what differed between:

- the earlier named-session / separate `--resume` proof shape;
- normal interactive or ACP-driven second prompts in an existing Goose session;
- managed Chrome versus Electron;
- plain model-only continuation versus a follow-up that reaches `Goose Native` or other tools.

Until that discrepancy is explained, the safe status is:

> **Fresh first turns are reliable enough for use; general same-session follow-up continuation is not qualified and has repeatedly failed in real use across both managed Chrome and Electron.**

## Current Electron reproduction

While Goose was being used for Goose Control work, a follow-up prompt in an existing Goose session failed with:

```text
Request failed: Responses API failed: Object {"message": String("ChatGPT browser/CDP control path became unresponsive after the message was sent."), "type": String("server_error"), "code": String("chatgpt_browser_control_unresponsive")}.
Please retry if you think this is a transient or recoverable error.
```

The failure happened **after the follow-up message had been sent to ChatGPT**.

### Browser behavior observed live

The Electron BrowserHost window showed a repeatable sequence:

1. the follow-up Goose prompt caused another ChatGPT Temporary Chat surface/tab to appear while a prior task tab was still visible;
2. the new tab contained the actual follow-up prompt and ChatGPT began acting on it;
3. ChatGPT reached the `Goose Native` connector and attempted to inspect/use its capabilities;
4. the ChatGPT UI displayed:

   ```text
   Goose Native
   No data returned
   This app returned no data.
   ```

5. that browser tab closed;
6. another fresh Temporary Chat tab opened and replayed the same follow-up work;
7. the close → fresh-tab → replay pattern repeated until the Responses request surfaced `chatgpt_browser_control_unresponsive`.

A screenshot captured one replayed tab after ChatGPT had already performed a shell inspection of the Day Shift repository and produced visible reasoning, demonstrating that the follow-up attempt had progressed materially before the failure/replay cycle.

The important defect is therefore **not** simply “a second tab exists.” A fresh Temporary Chat for a later logical Goose user turn is compatible with the intended architecture. The defect is that same-session follow-up enters an unhealthy lifecycle: prior/new work overlaps or remains retained, a sent prompt is replayed, Goose Native can return no data, and the request eventually fails.

## Fresh-chat recovery evidence

After the stuck browser tab is manually closed, a **new Goose chat** can submit its first ChatGPT-Web prompt successfully.

This is a strong discriminator:

- account authentication is still valid;
- ChatGPT itself is still reachable;
- the daemon/browser stack is not globally dead;
- a clean fresh-session/first-turn path can recover immediately;
- the failure is activated by the continuation path or state retained from the prior Goose session/turn.

A future test should also check a case not yet established by the current evidence:

> after manually cleaning up the stuck browser tab, can the **same persisted Goose session** successfully continue, or does only a brand-new Goose session recover?

That A/B sharply separates stale browser-turn state from persisted Goose/session/continuation metadata.

## Architectural invariant

Do **not** solve this by forcing physical reuse of one ChatGPT browser conversation across Goose user turns.

The intended architecture remains:

```text
persisted Goose session
  → later Goose user turn
  → Goose supplies durable accumulated context
  → provider may use a fresh ChatGPT Temporary Chat surface
```

Goose should remain the durable conversation source of truth.

What is **not** currently proven is that the implementation correctly maps later Goose turns onto fresh provider/browser turns while preserving the right logical session context, turn metadata, tool authority, and cleanup semantics.

## Current code evidence on main

Baseline when this note was created:

```text
40c29bfc59f6e51f1742784824110cd53e907de7
Reconcile runtime and Goose Control documentation
```

### Electron-only post-send liveness symptom

`src/adapters/chatgpt-web/control-liveness.ts` currently probes browser control after submission with:

- interval: 5 seconds;
- per-probe timeout: 3 seconds;
- terminal threshold: 2 consecutive failed probes.

The current probe is:

```ts
page.evaluate(() => document.readyState)
```

After two consecutive failures the watcher throws:

```text
status: 502
code: chatgpt_browser_control_unresponsive
retryable: true
```

This explains the final Electron error, but because managed Chrome also failed at same-session continuation before this Electron liveness mechanism existed, **do not assume this watcher is the root cause**. It may be:

- an Electron-specific secondary failure layered on top of the older continuation defect;
- a useful detector of a shared underlying stale/control state;
- or an additional bug that makes the common continuation defect noisier.

### Browser worker does not itself replay the Electron turn

`ChatGptBrowserWorker.run()` registers one promise per `traceId`. `runBrowserTurn()` races response watching against the post-send control-liveness failure, and then its cleanup path releases/closes that turn's browser connection.

There is no local `runBrowserTurn()` loop that intentionally opens another Temporary Chat after this error.

Therefore the repeated Electron tabs strongly suggest that the failed request is being submitted again **above that individual browser-worker run**. Identify the exact retry owner rather than inferring it from `retryable: true` alone.

## Upstream `miuuyy/codex-chatgpt-web` comparison — 2026-08-12

A focused review of current upstream history, issues, commits, and release state found **directly analogous second-turn failures and several important fixes**, but no current drop-in upstream patch that can simply be copied into this Goose fork.

### Upstream did solve an older second-turn lifecycle defect

Upstream issue #41 was titled **“Second turn of conversation always become error.”** Its symptoms included a first turn that worked, a later turn that failed with ChatGPT “Something went wrong,” and broker activity around the failure.

The maintainer first shipped a v1.1.3 fix so a retryable terminal ChatGPT failure was no longer cached and replayed for the rest of the local session. Upstream ultimately closed #41 in v2.0.0 after rebuilding the second-turn/long-task path around explicit browser-turn ownership. The maintainer described the important invariant as:

- failed or superseded browser responses are retired before continuation starts;
- stale/poisoned browser-turn state must not survive into the next logical turn;
- compaction starts a fresh correctly bound browser turn rather than inheriting poisoned state.

That architectural lesson is directly relevant here.

### The literal old upstream reclaim implementation does NOT fit current Goose/Electron architecture

An older upstream implementation (`Reclaim superseded browser turns`, commit `6152590f`) handled the then-single-surface launcher by cancelling **every** still-active browser turn whenever a different new turn started. That was correct only because one browser surface meant a new navigation physically superseded any prior turn.

Do **not** port that method literally.

Current `goose-chatgpt-web` intentionally supports multiple independent Electron turn surfaces and needs that concurrency for independent Goose sessions and future ChatGPT-Web subagents. A global “cancel all other active turns” rule would destroy legitimate parent/child or sibling concurrency.

The applicable principle is narrower:

> When a new user turn begins in one persisted Goose lineage, ensure any browser/provider turn that the same lineage has logically superseded is retired and fully detached before the new user turn takes ownership — while unrelated active lineages remain untouched.

Whether that **lineage-scoped retirement** is actually the missing fix remains to be proven from a correlated reproduction. Do not implement it until the daemon has a trustworthy stable Goose-lineage identifier and the exact stale state is demonstrated.

### Upstream's new-user-vs-tool-round execution-key fix is already present here

Upstream later fixed turn-key semantics so that:

- provider/tool-result rounds belonging to the same user instruction reuse one browser execution key;
- adding a genuinely new user instruction produces a different execution key/new browser turn.

Current `goose-chatgpt-web` already carries the evolved equivalent: `chatGptTurnExecutionKey()` includes the current user revision via `extractChatGptTurnUserRevision()`, and standalone Goose requests synthesize deterministic identity from the input prefix ending at the latest real user message. Tool-result rounds reuse that prefix; a new user message changes it.

Therefore “port upstream user-input execution keys” is **not** a missing solution on current `main`. The future investigation must verify that the standalone Goose request actually reaches that code with the expected shape on turn 2.

### Upstream stale broker-handle replay fix is already present here

Upstream commit `3b9bb54e` strips `turn_*` / `binding_*` handles from accumulated context before replaying prior conversation into a new ChatGPT Temporary Chat. The reason is that a model can otherwise copy a handle belonging to a finished turn and bind itself to dead authority.

Current `goose-chatgpt-web` already has `withoutRetiredTurnHandles()` in `prompt.ts` and applies it to the serialized context envelope. Do not rediscover or re-port this fix.

### Upstream broker-lifetime fix is already present here

Upstream commit `010028ba` made the turn-broker endpoint live for the runtime's lifetime rather than creating its socket only when a turn first registers. Current `goose-chatgpt-web` already starts `TurnBroker.forSocket(...).listen()` when the full-mode server starts.

Do not treat missing broker-listener lifetime as the leading explanation without contradictory live evidence.

### Upstream retryable-terminal-session retirement is already present here

The v1.1.3 lesson is also already implemented in the current Goose adapter: a retryable `ChatGptWebAdapterError` retires the failed `ChatGptTurnSession` so the next native retry does not replay the same cached terminal error for the session TTL.

This does not explain the current churn by itself, because the current Electron failure is post-send and the higher-level caller appears to submit the user prompt again on a new surface. The exact outer retry owner still has to be identified.

### Current upstream still has an OPEN “second turn always fails” issue

Upstream issue #99, **“Second turn is always a stream disconnected before completion,”** remains open. Its reporter likewise says the first run works and the second does not.

Upstream initially attributed that reporter's failure to large continuation prompts corrupting at a ChatGPT Lexical composer chunk boundary. v2.1.5 and v2.1.8 introduced progressively stronger prompt insertion/caret handling. Draft PR #106 continues that work with transactional chunk insertion, exact readback, caret re-anchoring, and abort propagation.

That work is worth tracking, but it is **not sufficient evidence for this Goose failure**:

- the upstream prompt-attachment defect occurs before send when the composer does not preserve the exact long prompt;
- the current Goose/Electron reproduction visibly sent the continuation, performed meaningful reasoning/shell inspection, reached Goose Native, and only then entered control-loss/replay churn.

So do not copy the v2.1.8 / PR #106 long-prompt patch as the continuation fix unless a local failing trace specifically dies in `prompt_attachment` with the same expected/actual/common-prefix evidence.

### Upstream applicability conclusion

Current upstream provides an important **design clue**, not a ready-made patch:

```text
native Codex lesson:
new logical user turn
  → old superseded turn for that task is retired
  → new browser turn owns clean authority/state

Goose adaptation required:
new user turn in Goose session/lineage A
  → retire only superseded state belonging to lineage A
  → do NOT disturb concurrent Goose lineage B / child agents
  → start clean browser turn for A
```

The first implementation question is therefore not “which upstream commit do we cherry-pick?” It is:

> **What stable, trustworthy Goose-session/lineage identity reaches the Responses daemon on ordinary full-mode turns, and does turn 1 remain registered/active under that lineage when turn 2 begins?**

Inspect request headers/metadata and Goose 1.45 behavior before inventing a lineage key. If Goose already supplies an authenticated/structural session ID, use that. Do not derive authority from prompt text or globally serialize the browser.

## Strongest current fault-boundary hypothesis

The transport-independent evidence suggests investigating the shared path first:

```text
Goose persisted session / second user turn
        ↓
Goose custom provider request construction
        ↓
Responses daemon logical turn/session identity
        ↓
provider-round / previous-response / native turn metadata handling
        ↓
turn-scoped Goose Native capability + broker lifetime
        ↓
common browser-worker turn lifecycle
        ↓
managed Chrome OR Electron surface
```

Electron-specific surface management remains relevant evidence, but it should come **after** the common layers above are checked.

## Primary diagnostic questions

Answer these before changing behavior.

### 1. What is different about a second Goose user turn?

Compare a successful fresh first turn with the failing second turn at the wire/session level:

- Goose persisted session ID;
- provider/model binding;
- complete request input/history shape;
- native turn metadata;
- `previous_response_id` or equivalent replay metadata if present;
- standalone identity / user-revision identity;
- tool registry/capability creation;
- daemon logical-turn/session lookup result;
- trace ID and browser-turn creation.

The key question is whether the second **user** turn is accidentally being interpreted as:

- continuation of the previous browser response;
- a tool-result round belonging to the previous browser turn;
- a new browser turn with stale previous-turn identity;
- or another mismatched hybrid.

### 2. Reconcile narrow `--resume` proof versus normal follow-up failure

Reproduce both paths against the same revision and compare exact requests.

Do not accept “the CLI proof passed once” as sufficient. Explain why the user-facing same-chat path differs or update the previous qualification claim.

### 3. Is stale browser-turn state retained after the first successful prompt?

Across both managed Chrome and Electron, record after the first completed turn:

```text
provider response terminal
→ daemon logical turn/session terminal
→ capability revoked
→ helper/browser connection cleanup
→ page/surface release
→ active browser turn count returns to zero
```

Then send the second Goose prompt.

Because manually closing a stuck tab allows a fresh Goose chat to work, determine whether an old page/turn/helper reference remains live or wedged and contaminates later requests.

### 4. Can the same Goose session recover after manual browser cleanup?

A/B:

```text
A: fail second turn → close stuck browser tab → retry SAME Goose session
B: fail second turn → close stuck browser tab → start NEW Goose session
```

If A fails while B passes, prioritize persisted session/continuation metadata.

If both pass after cleanup, prioritize stale browser/helper/turn lifecycle.

If behavior differs by managed Chrome vs Electron, isolate the transport-specific component only after the common path is understood.

### 5. Why does Goose Native return no data in the Electron replay?

Trace the connector/MCP/broker path without logging secret token values.

For each attempt verify:

- a valid turn-scoped capability exists;
- it maps to the intended active Goose turn;
- it has not already been revoked by a prior failed attempt;
- native turn/replay identity is correct;
- the Secure MCP Tunnel and MCP child are live;
- the broker returns a real tool request/result or precise failure rather than an empty response.

The `No data returned` symptom may be a consequence of the continuation defect rather than its cause.

### 6. Which component reissues the Electron continuation request?

Correlate:

- Goose/provider request;
- Responses daemon request/trace;
- browser-helper request ID;
- BrowserHost `traceId` / `surfaceId`;
- adapter error;
- any outer retry/backoff event.

Determine whether replay originates in Goose, the custom provider engine, the daemon, helper/client code, or another layer.

### 7. Is post-send blind retry semantically safe?

A tool-capable prompt may already have executed model work or tool side effects before control is lost.

Investigate whether post-send failures should instead be classified as ambiguous/unknown outcome unless the system can prove safe recovery without resubmitting the user prompt.

Do not introduce generic retries to hide the defect.

## Leading hypotheses — not conclusions

Rank only after a correlated reproduction.

1. **Shared continuation identity mismatch or missing lineage retirement.** The second Goose user turn creates a fresh execution key but the daemon may not explicitly retire superseded state belonging to the same persisted Goose lineage before the new turn starts.
2. **Completed-turn cleanup/lifetime defect common to both transports.** State from turn 1 remains active/wedged and poisons turn 2; manual browser cleanup allows a clean fresh session to work.
3. **Goose Native capability/broker lifetime mismatch on later user turns.** Turn-scoped authority from the new turn does not bind cleanly after the prior turn lifecycle.
4. **Higher-level replay of an already-sent Electron request.** The Electron 502 is marked retryable, causing repeated fresh surfaces after the first continuation attempt has materially executed.
5. **Electron post-send liveness false positive / partial CDP stall.** This can explain Electron churn but cannot by itself explain the historical managed-Chrome inability to continue.
6. **Separate transport-specific defects on top of one shared continuation weakness.** More than one issue may be present.

## Required evidence for the future investigation

Use a minimal disposable persisted Goose session. Capture both turn 1 and turn 2, plus a fresh-chat control.

Minimum evidence:

- Goose session ID/name and provider/model;
- exact distinction between fresh first turn and second user turn;
- daemon logical session/turn identity decisions;
- native turn/replay metadata with secrets redacted;
- trace IDs;
- active browser-turn counts before/after each turn;
- helper/browser page or surface lifecycle timestamps;
- Goose Native capability/broker lifecycle;
- retry events;
- existing diagnostics/screenshots;
- fresh new Goose chat control after manual cleanup.

Where practical, run the same minimal two-turn test under both managed Chrome and Electron so the first divergence point is visible.

Do not add a second Playwright/CDP observer as a normal diagnostic dependency.

## Repair constraints

Do not solve this with:

- arbitrary sleeps;
- generic retry loops;
- forcing browser-conversation reuse;
- globally serializing Electron;
- globally cancelling every other browser turn when one Goose session advances;
- restoring managed Chrome as the solution;
- moving Goose session ownership into the bridge;
- weakening Goose Native turn-token/capability isolation;
- swallowing ambiguous post-send failures;
- redesigning Goose Control around the bug.

The repair must preserve deliberate independent-turn concurrency for future ChatGPT-Web subagents.

## Qualification ladder after a fix

### A. Fresh first-turn control

A new Goose session completes one ordinary ChatGPT-Web prompt.

### B. Plain same-session follow-up

In that same Goose session, send a second dependent user prompt through the normal user-facing path that historically fails.

Require:

- correct dependent answer;
- no stale prior browser turn;
- no duplicate prompt execution;
- no retry churn;
- clean terminal browser/helper state.

### C. Three consecutive same-session turns

Run first turn + two later dependent turns. Each logical user prompt must execute exactly once.

### D. Compare CLI `--resume` and normal session continuation

If both are distinct product paths, prove both and document the difference. If they should be equivalent, make them converge on the same reliable provider contract.

### E. Tool-capable continuation

Use one harmless Goose Native read-only/tool action on a later same-session turn.

Require a real result, correct turn-scoped authority, and no `No data returned`.

### F. Recovery behavior

After an intentionally failed/aborted turn, prove the same persisted Goose session can either recover safely or fails with an explicit documented terminal-session state. A brand-new Goose chat must remain able to work without manual process repair.

### G. Original Goose Control workload

Only after A–F pass, retry the workload that exposed the bug.

### H. Concurrency regression check

Confirm two intentionally independent ChatGPT-Web turns can still overlap. Do not “fix” continuation by destroying bounded multi-surface support.

## Relationship to other work

- **PR #27** is broader Electron observability hardening. It may help explain Electron-specific liveness/churn but cannot own the cross-transport continuation root cause by itself.
- **PR #28** is naming/documentation planning; do not mix naming migration into this reliability fix.
- **Goose Control** belongs in Day Shift. It exposed the defect but should not work around it.
- **ChatGPT-Web subagent qualification** remains separate and depends on preserving intentional concurrency after continuation is repaired.

## Stop boundary

This document does not authorize implementation from an active ChatGPT-Web turn that would need to replace/restart the same daemon/browser runtime carrying that turn.

A future planning chat should first identify the first common divergence between successful fresh turn and failing second user turn. If repair requires changing/restarting the live ChatGPT-Web transport, use an independent provider/specialist session for implementation and proof.
