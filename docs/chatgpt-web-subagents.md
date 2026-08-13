# ChatGPT-Web subagents under Electron

Status: **active qualification; recursive child execution and parent/child overlap proven; parent + two reliable operating envelope not yet qualified**.

This document is the durable qualification record for ordinary Goose sessions whose parent provider is ChatGPT-Web and whose Goose-native child agent also uses ChatGPT-Web under the Electron BrowserHost.

Do not infer a larger supported envelope from the BrowserHost's five-tab safety ceiling. The intended normal target remains one parent + two ChatGPT-Web children, and that target is still under qualification.

## Objective

Qualify the smallest reliable operating envelope for:

```text
ordinary Goose parent
  → ChatGPT-Web provider turn
  → Goose-native Summon/delegate
  → ChatGPT-Web child provider turn
  → separate Electron BrowserHost surface
```

Target operating policy if proven:

- normal maximum: one ChatGPT-Web parent + two ChatGPT-Web children;
- rare maximum worth qualifying later: parent + three ChatGPT-Web children;
- do not optimize for BrowserHost's five-tab safety ceiling;
- continue to prefer cheaper/free workers when another strong ChatGPT-Web child is unnecessary.

## Ownership boundary

No new orchestration layer is intended.

```text
Goose creates and manages the subagent
  → selected child provider creates a normal provider turn
  → Electron supplies an isolated ChatGPT-Web browser surface
```

Goose continues to own logical conversation/session state, tools and approvals, delegation/subagents, recipes/extensions, project execution, and context lifecycle.

Electron continues to own BrowserHost only. Do not add Electron-specific delegation semantics, another task queue, another session database, a custom subagent scheduler, or a provider router.

## Current evidence

### Proven

- Ordinary Goose can use ChatGPT-Web as its main provider through the Electron runtime.
- Goose-native delegation from a ChatGPT-Web parent to explicit non-ChatGPT providers was already proven under managed Chrome and again under Electron with an NVIDIA child.
- A natural ordinary-Goose ChatGPT-Web parent successfully delegated to a ChatGPT-Web child under Electron.
- Parent and ChatGPT-Web child used distinct Electron surfaces and had real overlapping active intervals.
- Goose's native `delegate(..., async: true)` path is proven to return a background task/session ID, and `load(source: "<session_id>")` is proven to retrieve the result later.
- Independent Electron browser turns can run concurrently on separate task-bound surfaces.
- The Electron BrowserHost can create three distinct simultaneously active ChatGPT-Web turns. A controlled run achieved genuine parent + Child A + Child B overlap for about 24 seconds before the then-current liveness detector terminated two healthy turns.
- A later two-turn run on the hardened liveness candidate observed slow CDP probes on both parent and child followed by clean recovery, with BrowserHost heartbeats continuing and no native renderer-gone/destroyed/unresponsive event.
- A same-Goose-session follow-up after that delegation/network-error turn produced a coherent diagnosis of the preceding failure, adding post-error continuation evidence.

### Not yet qualified

- Reliable parent + two ChatGPT-Web children through natural Goose-native async delegation.
- Concurrent Goose Native tool calls from both ChatGPT-Web children while the parent is also active.
- Parent + three children as rare capacity.
- The current Electron-native liveness hardening candidate under a successful three-surface reproduction.

## Important live proofs

### Natural recursive child — PASS

An ordinary Goose ChatGPT-Web parent used native Summon/delegate to request one `chatgpt-web/medium` child returning `child-one-ok`.

Observed:

- parent Goose session `20260813_27`, trace `0445fc415bce`, surface `ymYeVhIXk68xYu0dRAY8VCKThmCsWXd3`;
- first child session `20260813_28`, trace `590af3a86caf`, surface `o2chJKvncPOHwxHOpAjgk0GmUcTWlAFm`;
- second duplicate child session `20260813_29`, trace `2291f4ef8eb9`, surface `zh-X2bYZH8_f4PBo_IpRlFB0yhH4WZJz`;
- both children returned `child-one-ok`;
- parent produced the requested final result once.

The duplicate second child was a separate model-issued tool call, not transport replay: distinct call IDs, sessions, traces and surfaces; the first child completed before the second began.

Parent/child overlap was real:

- parent alive about 16:51:20–16:55:57;
- parent + child 1 overlap about 16:52:17–16:54:26;
- parent + child 2 overlap about 16:54:30–16:55:46.

Conclusion: recursive ChatGPT-Web child execution and distinct parent/child surfaces are **proven**.

### Async delegation semantics — PASS

A later actor run proved invocation-level async behavior:

- Child A accidentally ran synchronously;
- Child B used `async: true` and returned immediately with a background session ID;
- the parent later retrieved Child B through `load(source: "<session_id>")`;
- parent overlapped independently with each child, but the two children did not overlap.

This established the exact Goose-native background-task contract without proving child-child parallelism.

### Three-way topology — REACHED, reliability failed under old liveness detector

A stricter run launched two async ChatGPT-Web children and required parent work before any `load()`.

Observed:

- parent session `20260813_33`, trace `eec6ad3be939`, surface `Q0j2bJw6AH_esbl8gc6iqN2Qe5aAQMxW`;
- Child A session `20260813_34`, trace `2681a1f45702`, surface `INa5oo_KrbXCEE3NhszkAgXQIv2QboCU`;
- Child B session `20260813_35`, trace `fbf3a387f92c`, surface `2eNnH_IQQU6t5_yBQ1pILFqFH8ue5uWh`;
- both delegate calls had `async: true`;
- no `load()` occurred before parent work;
- parent executed its own read-only shell work while both children were active;
- genuine three-way common interval was about 17:31:59.983–17:32:24.044 (~24 seconds).

Parent and Child A then terminated with `chatgpt_browser_control_unresponsive`; Child B simultaneously experienced a browser diagnostic capture timeout but recovered, performed three successful shell calls, and completed `child-b-ok`.

Subsequent forensic review established that Parent and Child A were not dead at their terminal timestamps: their own failure diagnostics still executed substantial DOM evaluation, and the parent captured a screenshot; BrowserHost heartbeats continued and no renderer-gone event occurred.

Conclusion:

- three distinct simultaneous ChatGPT-Web turns: **PROVEN**;
- reliable parent + two operating envelope: **NOT QUALIFIED**;
- old per-turn control-liveness terminal: **FALSE TERMINAL** for Parent and Child A;
- concurrent child tool use across both children: **NOT PROVEN** because Child A failed before its first shell call.

### Liveness hardening candidate — static/unit validation PASS, three-way live proof pending

The failure above drove a narrow liveness redesign. The candidate implementation is intentionally tracked separately from this documentation-only PR and must not be treated as qualified until its live proof passes.

The intended state model is:

```text
Electron-native owned-surface lifecycle
  active
  unresponsive       → degraded, not terminal
  responsive         → recovery
  gone               → deterministic terminal
  destroyed          → deterministic terminal

CDP/DOM evidence
  completed probe    → positive health
  DOM progress       → positive health
  slow probe         → congestion evidence, not renderer-death evidence

last resort
  prolonged indeterminate control state → bounded fail-closed terminal
```

The candidate preserves one control probe in flight at a time and exposes per-turn native lifecycle evidence through the existing BrowserHost turn heartbeat path. Renderer PID is recorded for correlation only, never as sole proof of health.

Static/unit validation reported before the next live run:

- `bunx tsc --noEmit` clean;
- `bun test tests/*.test.ts` 392 passed, 0 failed;
- `bun run --cwd launcher test` 171 passed, 0 failed;
- `git diff --check` clean.

Do not silently upgrade this implementation candidate to proven until the three-surface live proof runs on the exact committed candidate revision.

### Latest attempted parent + two proof — INVALID ASYNC SEQUENCE, useful two-way liveness evidence

The next actor attempted the parent + two async proof but the first model-generated delegate invocation omitted the actual `async: true` field. Goose's native delegate schema defaults `async` to false. Prose inside the child `instructions` saying “run asynchronously” cannot change the parent tool call's execution mode.

Persisted delegate arguments contained `provider`, `model`, and `instructions`, but no `async` field.

Only parent + Child A formed:

- parent trace `5b705eba9831`, surface `PvL4JBm0rhUmh5C5HuVhDRWz3ziTlPYo`, renderer PID 82947;
- Child A trace `9e97210f4e30`, surface `bMVnXj_KU0QgNd2lGaYszPIDFbyoQALI`, renderer PID 82977;
- parent/child overlap lasted about 5 minutes;
- Child B was never created.

The synchronous delegate path later returned `Network error: Stream decode error: error decoding response body`. The parent correctly stopped the qualification before launching Child B.

Useful liveness evidence from this otherwise invalid run:

- parent slow control probe ~5.2s → recovered ~6.6s;
- Child A slow probe ~5.0s → recovered ~5.3s;
- parent had 3 DOM-read failures, Child A 1;
- no native unresponsive/responsive/gone/destroyed event;
- BrowserHost heartbeats remained healthy;
- daemon and BrowserHost PIDs remained stable;
- no three-way topology existed, so this is not a three-way pass or failure.

The different renderer PIDs in this run also mean renderer-process sharing must not be assumed as a universal explanation for earlier contention. The older three-way run lacked PID instrumentation, so whether those three surfaces shared a renderer remains unresolved.

### Post-error continuation — PASS

After the invalid delegation/network-error turn, a follow-up user message in the same ordinary Goose conversation asked why the delegation had not run asynchronously.

The next ChatGPT-Web turn correctly identified that the actual delegate tool call omitted `async: true`, explained that async defaults false, distinguished child-instruction prose from invocation-level execution mode, and separately identified the stream-decode error as unrelated to the missing async flag.

Conclusion: this provides additional evidence that a delegation/network-error episode does not inherently poison later same-Goose-session continuation.

## Goose-native delegation contract

Use Goose's built-in Summon/delegate path. Do not invent a custom scheduler.

Named recipes are useful because they can make child identity and workload deterministic, including provider/model/max-turn/tool configuration. However, current qualification evidence shows that **async is an invocation-level delegate argument**.

Therefore a recipe can reduce the parent call to approximately:

```text
delegate(source: "chatgpt-web-concurrency-child-a", async: true)
delegate(source: "chatgpt-web-concurrency-child-b", async: true)
```

Do not rely on prose inside child instructions to request background execution. If `async: true` is absent, the call is synchronous.

## Qualification strategy from here

Keep two separate proofs so browser/runtime qualification does not depend on model compliance with one structured argument.

### Proof 1 — deterministic three-surface BrowserHost/liveness proof

Use committed first-party qualification infrastructure to launch three ordinary Goose ChatGPT-Web sessions concurrently:

- one `chatgpt-web/high`;
- two `chatgpt-web/medium`;
- fixed bounded read-only workloads;
- Goose Native shell use;
- committed log/evidence analyzer.

This proves the BrowserHost/liveness operating envelope without relying on a parent model to remember `async: true`.

Pass requires:

- three distinct traces/surfaces;
- a real common overlap interval;
- successful tool work during the overlap;
- no false terminal;
- no ownership/capability crossover;
- no runtime restart;
- clean terminal release;
- native lifecycle and control-liveness evidence retained.

### Proof 2 — natural recursive parent + two async children

Separately qualify the real target topology:

```text
ChatGPT-Web parent
  → delegate(source: child-a, async: true)
  → delegate(source: child-b, async: true)
  → parent work before load()
  → load child A
  → load child B
```

Use committed named recipes so provider/model/task/tool requirements are stable and the parent only has to generate the small invocation-level async calls.

If either delegate omits `async: true`, classify the run as **INVALID ASYNC SEQUENCE**, not as a BrowserHost failure.

## Failure classification

Keep these classes separate.

### Connector safety failure

Safety-block response before Goose starts a delegated child. This does not test Electron concurrency.

### Async invocation omission

The parent-generated delegate tool call omits `async: true`, so Goose uses the synchronous default. This invalidates an async-concurrency proof before BrowserHost conclusions can be drawn.

### Recipe/discovery failure

Named source not found or recipe parse/configuration error. Fix the test setup, not the browser runtime.

### Stream/transport decode failure

Examples include `Network error: Stream decode error: error decoding response body`. Record separately from async compliance and browser liveness; do not infer one caused the other without evidence.

### Provider-resolution failure

Delegate accepted and recipe resolved, but child provider/model creation fails before a child BrowserHost trace appears.

### Browser/liveness failure

A child provider trace/surface starts and ownership/lifecycle/control subsequently fails. Distinguish deterministic native `gone`/`destroyed` evidence from prolonged indeterminate control state and from recoverable slow probes.

### Account rate limit

Structured 429 / `rate_limit_exceeded`. Do not treat automatically as BrowserHost concurrency failure.

### Isolation failure

Wrong result routing, surface/trace ownership crossing, heartbeat owner mismatch, or one turn's cleanup corrupting a sibling.

## Evidence to retain

For every qualification run record:

- exact committed revision under test;
- helper bundle identity and fresh-helper preflight;
- parent/child Goose session IDs where relevant;
- provider/model selection;
- delegate arguments including whether `async: true` was actually present;
- trace IDs and BrowserHost surface IDs;
- renderer PIDs where exposed;
- native lifecycle transitions;
- slow/recovered/indeterminate control-liveness events;
- DOM-read failures;
- heartbeat/lease evidence;
- tool-call evidence;
- creation/completion/release timestamps and overlap windows;
- structured 429 evidence;
- runtime process restart evidence.

Prefer committed first-party observation tooling over ad-hoc monitor-agent shell reconstruction.

## Promotion rule

Recursive parent → ChatGPT-Web child is already proven. Do not regress that claim back to unproven.

The normal parent + two operating envelope remains **unqualified** until both the deterministic three-surface liveness proof and the natural parent + two async integration proof are clean on the current liveness implementation.

A smaller reliable envelope is preferable to treating the five-tab safety ceiling as an operating target.

## Qualification log

### 2026-08-12 — initial review

- BrowserHost structurally multi-turn.
- First synthetic/ad-hoc recursive attempt safety-blocked before child launch.
- Decision at that time: no transport change based on a pre-Electron safety block.

### 2026-08-13 — natural recursion and overlap

- Natural parent → ChatGPT-Web child succeeded.
- Parent/child distinct surfaces and overlapping active intervals proven.
- Parent model duplicated the child sequentially; classified as model tool-calling behavior, not replay.

### 2026-08-13 — async semantics

- Native async delegate returned a background session ID.
- Later `load(source: session_id)` retrieved the child result.
- Child-child overlap not achieved in that run because the first child call was synchronous.

### 2026-08-13 — three-way overlap and false terminal

- Parent + two async children genuinely overlapped for ~24 seconds.
- Parent performed own shell work during the common interval.
- Parent and Child A were falsely terminated by the old browser-control liveness detector while Child B experienced similar control slowness, recovered and completed.
- Forensics showed Parent/Child A renderers still executed DOM diagnostics at their terminal timestamps.

### 2026-08-13 — native-lifecycle hardening candidate

- Liveness design changed toward Electron-native `gone`/`destroyed` authority, recoverable `unresponsive`/`responsive`, one control probe in flight, and a bounded prolonged-indeterminate fallback.
- Static/unit suites passed; live three-surface qualification still pending.

### 2026-08-13 — invalid async attempt, useful recovery evidence

- Parent omitted invocation-level `async: true`; only parent + Child A formed.
- Slow CDP probes on both turns recovered cleanly under the candidate liveness design.
- Renderer PIDs differed (82947 / 82977) in this run.
- Synchronous child path later hit a stream decode error; parent stopped the proof correctly.
- A later same-session user follow-up produced a coherent diagnosis of the missing async field and separate network error.
- Next: committed deterministic qualification runner + committed evidence analyzer, then natural parent + two proof using named child recipes and explicit `async: true`.