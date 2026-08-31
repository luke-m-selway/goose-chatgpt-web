# ChatGPT-Web design and hardening principles

Status: **living draft**.

This document records the engineering principles used to guide ChatGPT-Web architecture, reliability fixes, testing, and future hardening.

It is intentionally evolutionary. The current version preserves principles already established through implementation and ecological evidence. Add or change principles when real evidence justifies doing so; do not expand this into speculative architecture guidance.

## 1. Preserve the ownership model

Use the authoritative owner of each kind of state.

### Goose owns

- logical conversation and session state;
- authoritative context;
- compaction;
- tools and approvals;
- delegation and subagents;
- recipes/extensions;
- project execution.

### Responses/provider infrastructure owns

- provider request execution;
- bounded provider execution identity/replay;
- provider-specific transport and settlement.

### Electron BrowserHost owns

- authenticated ChatGPT browser state;
- task-bound browser surfaces;
- browser-surface leases;
- BrowserHost-local lifecycle and cleanup.

### Other systems

Secure MCP Tunnel owns its connector transport boundary.

Goose Control remains above Goose and provider-agnostic.

Do not compensate for a defect by moving responsibility into a layer that does not own it.

## 2. Goose-native first

Before adding provider-specific machinery, prefer an existing Goose-native identity, lifecycle, continuation, tool, cancellation, delegation, compaction, or provider mechanism where it correctly expresses the requirement.

Do not build a second session system, orchestration framework, context owner, retry framework, or provider router around a capability Goose already owns.

Custom infrastructure should fill a demonstrated gap, not provide a parallel version of Goose.

## 3. Infrastructure before symptom handling

Prefer removing the condition that creates an error over handling the error afterward.

Examples of the preferred direction:

- make distinct logical executions have distinct identities rather than clear stale collisions afterward;
- remove an unstable UI step rather than repeatedly retrying the click;
- establish correct execution ownership/settlement rather than repeatedly cleaning up orphaned browser surfaces;
- externalize transport that cannot reliably fit through the browser composer rather than continually increasing attachment timeouts.

Ask first:

> Can the invalid state be made impossible?

If not:

> Can it be made directly observable at the layer that owns it?

Only then add recovery/error handling.

## 4. Deterministic state before elapsed time

A timeout is a safety ceiling, not readiness evidence.

When a real state indicator exists, observe it.

Prefer signals such as:

- selected connector identity;
- authenticated BrowserHost state;
- surface lease acquisition/release;
- active-turn counts;
- execution identity;
- Responses settlement;
- SSE completion;
- native navigation/load events;
- renderer/WebContents lifecycle;
- broker capability state;
- explicit Goose session/turn metadata.

Avoid using:

- fixed sleeps;
- arbitrary delays;
- repeated blind retries;
- "wait N seconds and assume ready".

Polling is acceptable when the underlying interface offers no better signal, but poll for an explicit deterministic condition.

## 5. Prefer event/state-driven coordination

Where practical, react to authoritative lifecycle transitions rather than periodic guesses.

If an existing callback, response, state flag, lease acknowledgement, or settlement event answers the question, use it.

Do not introduce another polling loop merely because it is easier to write.

## 6. One authority for each decision

Avoid multiple independent mechanisms answering the same question.

Prefer:

- one execution identity contract;
- one readiness definition;
- one lifecycle owner;
- one retry authority;
- one cancellation path;
- one canonical startup/shutdown path.

Multiple fallbacks often create ambiguous ownership and harder failure reconstruction.

A fallback is justified only when it represents a genuinely distinct supported mode or failure boundary.

## 7. Distinguish pre-submission from post-submission failure

This is a critical reliability boundary.

Before a prompt can possibly have reached ChatGPT, recovery can usually be more aggressive and deterministic.

After submission may have occurred, duplicate execution becomes possible.

### Definitely pre-submission

Prefer deterministic retryability/retirement based on known state.

### Potentially post-submission

Be conservative.

Do not blindly replay merely because local acknowledgement failed.

First establish whether there is independent evidence of remote acceptance, generation, or execution.

## 8. Ambiguity should reduce authority

A component should gain less automatic recovery authority as certainty falls.

For example, an ambiguous send acknowledgement should not authorize arbitrary BrowserHost restart or prompt replay.

Unknown does not mean failed.

Timeout does not mean unsubmitted.

Visible browser generation does not automatically mean the outer Goose request will settle successfully.

Preserve those distinctions.

## 9. Prefer deletion and simplification

When two solutions satisfy the same contract, prefer the one with:

- fewer persistent states;
- fewer UI interactions;
- fewer selectors;
- fewer processes;
- fewer lifecycle transitions;
- fewer retry loops;
- fewer fallback paths;
- fewer exceptional branches.

A reliability repair should ideally leave less machinery behind.

Deleting a fragile interaction is usually better than wrapping it in retries, timeouts, and recovery logic.

## 10. Reuse proven primitives

Build from contracts already established by evidence.

Examples include:

- Goose session identity;
- native turn identity;
- provider execution keys;
- BrowserHost leases;
- canonical lifecycle commands;
- supported cancellation;
- authenticated BrowserHost readiness;
- existing capability/revocation boundaries.

Do not recreate equivalent state locally without a demonstrated reason.

## 11. Keep state bounded and owned

Any new registry, artifact, capability, cache, or retry state must have:

- one owner;
- one purpose;
- a bounded lifetime;
- explicit retirement;
- clear retry/replay semantics;
- no hidden claim to authoritative Goose state.

Persistent state without clear retirement is a reliability risk.

## 12. Preserve causal errors

Report the failure that actually occurred.

Do not turn:

- browser-control failure into "login expired";
- transport failure into generic timeout;
- pre-lease absence into post-send ambiguity;
- cancellation into provider failure;

unless evidence genuinely supports that classification.

Later cleanup/retry failures must not overwrite the original causal failure.

## 13. Fix the owning layer

A defect should normally be repaired where its violated invariant belongs.

Examples:

- provider execution identity -> provider boundary;
- Goose scheduling/compaction -> Goose/provider integration;
- BrowserHost surface ownership -> BrowserHost;
- Responses settlement -> Responses/provider transport;
- connector transport -> connector/tunnel boundary.

Do not put ChatGPT-Web-specific fixes into Goose Control merely because it is convenient.

## 14. Recovery and diagnosis are separate

Operational recovery should restore a clean known state with the smallest supported action.

Diagnosis should then inspect preserved evidence separately.

Do not let emergency cleanup evolve into an architecture rewrite.

Similarly, do not make a recovery agent continue the failed logical turn merely to discover what happened.

## 15. Avoid self-interference

An agent must not manipulate the runtime infrastructure it currently depends on and then treat the result as a valid qualification.

Runtime stop/restart, retained-turn cancellation, BrowserHost reconstruction, and similar operations should be performed out of band.

Read-only inspection from a ChatGPT-Web agent is encouraged where it does not alter the provider/runtime it depends on.

## 16. Evidence before mechanism

Prefer ecological evidence from ordinary useful work.

Use the passive flight recorder and existing logs before adding more instrumentation.

When an uncertainty remains, design the smallest experiment that separates the remaining hypotheses.

Do not use synthetic stress when one bounded test answers the actual question.

Successful turns are evidence too.

## 17. Tests should prove contracts, not timing luck

Tests should answer questions such as:

- are identities different when they must be different?
- are identities stable when they must remain stable?
- is a capability revoked?
- is a lease released?
- is submission known to be accepted?
- did the correct owner settle?
- did the causal error survive?

Avoid tests whose only evidence is that something happened within an arbitrary time window.

Timeouts in tests should bound hangs, not define correctness.

## 18. Prefer hermetic validation by default

Static/unit/integration verification should not unexpectedly manipulate the user's live runtime.

Tests that require:

- Electron;
- managed Chrome;
- BrowserHost;
- real ChatGPT;
- runtime restart;
- reboot/login;
- live Goose sessions;

should be explicit qualification/smoke steps rather than hidden side effects of otherwise hermetic validation.

## 19. Resource efficiency matters, but not at the cost of lifecycle complexity

Avoid keeping heavy browser infrastructure alive when it is not needed where a clean lifecycle signal permits lazy activation.

However, do not build another supervisor, idle timer, or per-chat lifecycle system merely to save a small amount of idle resource usage.

Optimize the expensive component first.

Prefer simple application/provider-lifetime ownership over repeated start/stop churn.

## 20. Concurrency must retain identity and ownership

Concurrency is useful only when each execution has:

- an unambiguous logical owner;
- a unique execution identity where required;
- an independent browser-surface lease;
- bounded continuation/cancellation semantics;
- deterministic settlement.

Do not serialize everything merely to hide an identity or ownership defect.

Likewise, do not increase concurrency until lower-level identity and settlement contracts are trustworthy.

## 21. Complexity has a budget

For any proposed repair, compare the complexity added with the bad state eliminated.

Prefer the design that achieves the required invariant with the lowest ongoing maintenance and runtime complexity.

A repair that needs:

- another registry;
- another retry loop;
- another timer;
- another supervisor;
- another UI fallback;

should face a high burden of proof.

## 22. Deviations require evidence

These principles are defaults, not dogma.

A better solution may occasionally trade one principle against another.

When doing so, record:

1. the principle being traded off;
2. the demonstrated reason;
3. the evidence;
4. the scope of the exception;
5. how the exception could later be removed.

Do not weaken a principle merely because the alternative is easier to implement.

## Design review checklist

Before approving a reliability or infrastructure change, ask:

1. Is this fixing the layer that owns the violated invariant?
2. Is there a Goose-native mechanism we should use instead?
3. Can the bad state be prevented rather than recovered from?
4. Are we reading an authoritative state signal or guessing from time?
5. Is a timeout only a safety ceiling?
6. Are pre-submit and post-submit failures kept distinct?
7. Could this retry duplicate real work?
8. Does this introduce a second authority for an existing decision?
9. Can a fragile step be deleted instead?
10. Does every new state have ownership and retirement?
11. Is the original causal error preserved?
12. Can the proof be deterministic and hermetic?
13. Does this require out-of-band qualification to avoid self-interference?
14. Is the solution simpler than the alternatives?
15. What would allow us to delete this machinery later?

When the answer to one of these reveals a weaker architecture, address that before adding another recovery layer.
