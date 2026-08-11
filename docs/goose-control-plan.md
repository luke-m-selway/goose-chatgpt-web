# Goose Control — deferred planner-to-Goose control bridge

Status: **auxiliary design note / deferred; not an active implementation milestone**  
Captured: **2026-08-10**  
Last scoped: **2026-08-11**  
Purpose: preserve the design so a future dedicated implementation chat can resume without reconstructing the architecture from memory.

## Why this exists

`goose-chatgpt-web` has already proved the execution direction:

```text
Goose
  ↓ provider request
goose-chatgpt-web
  ↓
ChatGPT Web
```

ChatGPT Web can act as the main model/provider inside ordinary Goose while Goose owns conversation state, tools, local execution, delegation, approvals, recipes, and provider policy.

The remaining usability problem is the planning/execution boundary. Luke often uses a separate persistent ChatGPT planning conversation to reason about architecture and choose the next step, then manually copies a bounded prompt into Goose, waits for Goose, copies the result back into the Planner, and repeats.

**Goose Control** is the narrow bridge that should remove that clipboard relay without collapsing planning and execution into one conversation.

The first goal is not autonomous orchestration. It is:

```text
Planner → approved Goose session → result back to Planner
```

with no prompt or output copying by Luke.

## Canonical architectural roles

Use these technical role names:

```text
Luke / User
Planner
Orchestrator
Workers
Session Guardian
Goose Control
```

Corporate titles are explanatory analogies only:

```text
Luke / User   ≈ CEO / owner / final authority
Planner       ≈ Chief of Staff / strategic adviser
Orchestrator  ≈ COO / operational manager
Workers       ≈ execution teams
```

The software flow may be `Luke → Planner → Orchestrator → Workers`. Do not derive authority or routing rules from the corporate analogy.

## Desired user experience

Current flow:

```text
Luke
  ↓
ChatGPT Planner
  ↓ generates paste-ready prompt
Luke copies prompt
  ↓
Goose session
  ↓ runs task
Luke copies result
  ↓
ChatGPT Planner
  ↓ assesses result / generates next prompt
```

Goose Control MVP:

```text
Luke
  ↓
ChatGPT Planner
  ↓ Goose Control
approved Goose session
  ↓ runs task
Goose Control
  ↓
ChatGPT Planner
  ↓ assesses result / sends next instruction
```

Luke should no longer need to:

- copy prompts into Goose;
- copy Goose output back into ChatGPT;
- remember raw Goose session IDs;
- manually relay execution status.

A later ChatGPT turn may still be required to let the Planner retrieve a completed background job. The connector alone should not be assumed to wake a finished ChatGPT conversation spontaneously.

## Core architectural rule — terminate at Goose, not the browser host

**Goose Control must be provider- and browser-host-agnostic. It addresses Goose sessions, not ChatGPT browser sessions.**

Preferred layering:

```text
Luke
  ↕
ChatGPT Planner
  │
  │ Goose Control connector
  ▼
Goose Control gateway
  │
  │ native Goose control/session protocol
  ▼
Goose session
  │
  ├── tools / delegation / approvals / Workers
  │
  └── provider
        │
        └── ChatGPT Web
              │
              └── browser-host implementation
                    ├── managed Chrome (legacy)
                    ├── Electron Chromium (current migration)
                    └── future qualified host
```

The current managed-Chrome → Electron/browser-host migration therefore does **not** redefine the Goose Control contract.

Do not make the Planner-facing control plane depend on:

- Electron window IDs;
- Playwright pages;
- CDP targets;
- ChatGPT conversation URLs;
- browser helper state;
- browser-host process identity.

The repository's existing `launcher/electron/control-server.cjs` is part of the Electron/runtime reliability plane. Despite the name, it is **not** Goose Control and should not become the Planner-facing session-control API.

This separation is intentional so the browser host can continue evolving without changing Planner → Goose semantics.

## Architectural principle

**Do not merge the Planner and executor merely to eliminate copy/paste.**

The planning conversation is valuable because it stays separate from long implementation turns, tool output, logs, retries, and code context. Goose Control should preserve that context membrane.

Initially the Planner may address one or more execution Goose sessions directly. Later the same interface may target a persistent Orchestrator.

## Goose Control is not Goose Native

Keep these two planes separate.

### Goose Native

```text
active ChatGPT-Web provider turn
  ↓
Goose Native connector
  ↓
Goose-owned tools / delegation for that turn
```

Goose Native is an execution-time bridge tied to the active Goose turn and its broker/tool semantics.

### Goose Control

```text
persistent ChatGPT planning conversation
  ↓
Goose Control
  ↓
Goose session/job management
```

Goose Control is a management plane across approved Goose sessions.

The existing private connector / tunnel pattern may be reusable as **exposure plumbing**, but Goose Control should not reuse Goose Native's turn-token or active-provider-turn semantics.

Do not give Goose Control arbitrary shell, file-editing, browser-control, credential, or process-management capabilities merely because Goose Native or Goose itself has them.

## Preferred implementation direction — ACP-first, thin adapter

The earlier design left open whether Goose Control needed a substantial custom session manager. Current upstream Goose makes a thinner design preferable.

As of the 2026-08-11 upstream review:

- Goose exposes ACP as a first-class client protocol.
- `goose serve` exposes an authenticated ACP server surface for process-separated clients.
- ACP sessions are persisted into Goose session history.
- Goose's built-in Orchestrator has native session operations for listing, viewing, starting, messaging, and interrupting agent sessions.
- Current Orchestrator `send_message` is synchronous and fails closed when the target session is already busy.
- `start_agent` currently inherits the parent provider/model rather than exposing arbitrary model selection.

Therefore the preferred shape is:

```text
ChatGPT Planner
       │
       │ MCP/custom-app style action surface
       ▼
┌──────────────────────────────┐
│ Goose Control                │
│ thin restricted gateway      │
│                              │
│ • authorization              │
│ • target aliases             │
│ • async job ledger           │
│ • idempotency                │
│ • result projection          │
└──────────────┬───────────────┘
               │
               │ Goose-native ACP/session API
               ▼
         ┌─────────────┐
         │ goose serve │
         └──────┬──────┘
                │
             Goose
                │
         approved session
```

### Native-first rule

Before adding custom session/runtime code, prefer in this order:

1. current Goose ACP/session APIs;
2. current Goose Orchestrator/AgentManager primitives where they provide the required semantics;
3. existing Goose task/session persistence;
4. only then a narrow Goose Control compatibility layer for missing behavior.

Do **not** build a second agent runtime, session engine, or browser controller.

### Why a gateway still exists

ACP does not automatically provide the complete Planner UX.

The Planner needs:

- a restricted set of approved targets rather than arbitrary local Goose authority;
- asynchronous submit-now / retrieve-later semantics;
- durable `job_id` state independent of a single ChatGPT tool call;
- duplicate-submission protection;
- stable output projection;
- semantic aliases so the Planner does not manage raw session IDs.

Those are appropriate responsibilities for Goose Control.

## Minimal Planner-facing API

Keep the first public surface deliberately small:

```text
list_targets()

submit_task(
  target,
  mode,
  instructions,
  request_id
)
  → job_id, session_id, state

get_job(job_id)
  → state, result?, error?, target/session metadata

cancel_job(job_id)
```

Where:

```text
mode = continuation | fresh
```

For the **first proof**, `continuation` against one pre-approved, already-running Goose session is sufficient. `fresh` may remain unsupported until the exact session/bootstrap behavior is proven.

Do not initially expose:

- arbitrary `start_session`;
- arbitrary working directories;
- arbitrary provider/model selection;
- shell execution;
- file APIs;
- browser/CDP operations;
- generic process management;
- tunnel administration.

Expand only when a concrete workflow requires it.

## Async job semantics

Long Goose work must not hold a Planner connector call open for the duration of execution.

Desired interaction:

```text
submit_task(
  target = "goose-chatgpt-web:orchestrator",
  mode = "continuation",
  instructions = "...",
  request_id = "..."
)
```

Immediate response:

```json
{
  "job_id": "goose_job_0042",
  "session_id": "20260811_7",
  "state": "running"
}
```

Goose continues independently.

A later Planner turn calls:

```text
get_job("goose_job_0042")
```

and receives:

```text
queued
running
completed
failed
cancelled
unknown
```

For terminal states, return enough canonical Goose output for the Planner to judge the next step without copying large internal logs by default.

### At-most-once submission / idempotency

`submit_task` must accept a caller-generated `request_id`.

If the Planner or connector retries after a network ambiguity, the same `request_id` must resolve to the existing job rather than enqueueing the same instruction twice.

This is a correctness requirement, not a later optimization.

A request ID reused with materially different task content must fail closed.

## Target/session aliases

The Planner should normally address semantic targets rather than raw IDs.

Example:

```text
goose-chatgpt-web:orchestrator
  → approved Goose session

goose-chatgpt-web:deployment
  → approved deployment session

day-shift:orchestrator
  → approved Day Shift session
```

The exact storage can remain small. Required properties:

- deterministic resolution;
- visible project/purpose;
- no silent guessing;
- fail closed when unknown or ambiguous;
- clear mapping to the actual Goose session ID.

Potential stored fields:

```text
alias
project/repository
session_id
purpose
state
last_job_id
created_at
updated_at
```

## Continuation vs fresh-session policy

The existing planning convention becomes an explicit control decision:

```text
CONTINUATION — use the existing agent chat/context
```

versus:

```text
FRESH CHAT — start a new agent chat/context
```

The Planner should continue only when the task is genuinely incremental within the same workstream.

A distinct diagnostic, milestone, or problem should receive a fresh session so stale assumptions and accumulated context do not contaminate it.

The connector must not silently infer continuation when there is meaningful ambiguity.

For the MVP, prefer **continuation against one known target**. Fresh-session creation is a second milestone because it introduces working-directory, profile, provider/model, and bootstrap questions that are unnecessary for proving the clipboard-free loop.

## Planner availability and the remaining manual nudge

A connector can remove prompt/output copying but does not by itself create a durable process that can initiate a new ChatGPT Planner turn after the Planner has finished responding.

Expected intermediate behavior:

```text
Luke → Planner: start/continue task
Planner → Goose Control: submit async job
Planner → Luke: job accepted

Goose completes independently

Luke → Planner: "check"
  or Luke sends any normal new message

Planner → Goose Control: retrieve relevant job
Planner → evaluates result
Planner → Goose Control: submits next bounded step if appropriate
```

The Planner should opportunistically inspect relevant pending jobs when Luke next talks normally, so `check` is not a special command Luke must remember.

Automatic wake-up belongs to a later event-driven workflow owner and is not part of the MVP.

## Electron/browser-host relationship

The Electron migration affects only narrow seams below Goose Control.

### Session bootstrap

If Goose Control later creates fresh Goose sessions, it needs a stable Goose profile/configuration policy.

Do not encode "Electron" into that policy. A new session should request an approved Goose role/profile such as `orchestrator`, while Goose/provider configuration determines how ChatGPT Web is hosted.

Until this is settled, the first MVP should target an already-running approved Goose session.

### Health

Goose Control may eventually expose a coarse target health such as:

```text
ready
busy
degraded
unavailable
```

But it should not diagnose or repair Electron directly.

Browser/runtime recovery belongs to the browser host and later Session Guardian reliability plane.

### Cancellation

`cancel_job(job_id)` means:

```text
cancel the corresponding Goose operation
```

It must not silently mean:

```text
kill Electron
kill Chromium
restart the browser host
restart Goose
```

Cancellation should use the native Goose/ACP/session cancellation path wherever possible.

## Security and authority model

The Planner-facing connector should expose the minimum management authority needed for this workflow.

Allowed in the first useful version:

```text
✓ list approved semantic targets
✓ submit a bounded instruction to an approved target
✓ retrieve job state and result
✓ cancel a job submitted through Goose Control
```

Potentially later, after separate review:

```text
△ create a fresh session from an approved profile/root
△ inspect approved session metadata
△ select among pre-approved execution profiles
```

Disallowed directly through Goose Control:

```text
✗ arbitrary shell execution
✗ arbitrary file reads/writes
✗ credential/keychain access
✗ browser/CDP control
✗ broad process killing
✗ Goose-host lifecycle disruption
✗ changing tunnel identity
✗ arbitrary provider/model spending
✗ arbitrary working-directory selection outside approved roots
```

If a task needs shell/files/tools, the receiving Goose session performs those actions under Goose's normal permissions and policies.

### `goose serve` security

Current upstream `goose serve` supports an authenticated ACP endpoint and refuses unauthenticated startup unless an explicit dangerous override is used.

The implementation should therefore:

- keep Goose's ACP listener loopback/private unless a concrete reason requires otherwise;
- keep Goose's server secret out of Planner-visible tool results and logs;
- put the external ChatGPT-facing connector in front of Goose rather than exposing raw ACP authority directly to the internet;
- validate every target/action server-side;
- preserve the existing Secure MCP Tunnel identity unless a reviewed design requires a separate connector identity.

Do not use `--dangerously-unauthenticated` for the real control path.

## Relationship to upstream Orchestrator / Project Palmate

Goose's built-in Orchestrator substantially overlaps the internal mechanics Goose Control once expected to implement itself.

Current Orchestrator can:

```text
list_sessions
view_session
start_agent
send_message
interrupt_agent
```

Important current behavior:

- it is built into Goose rather than being an external Day Shift runtime;
- it uses Goose's own `SessionManager` / `AgentManager`;
- `send_message` registers target-session cancellation and fails when that session is already busy;
- `send_message` consumes the target response synchronously before returning;
- `start_agent` currently inherits the parent provider/model;
- it cannot send to its own parent/orchestrator session through that tool.

This is useful evidence for the **native control primitives**, but it does not mean Goose Control should simply expose the hidden Orchestrator tool wholesale to ChatGPT.

Goose Control still needs a narrower authority surface, asynchronous Planner semantics, aliases, idempotency, and durable result retrieval.

### Why not wait for full Palmate-style orchestration?

A mature persistent Planner/Orchestrator system additionally needs:

```text
persistent Orchestrator
task ledger
Worker selection
parallelism
review loops
authority policy
budget/provider policy
completion events
failure recovery
context membranes
durable orchestration state
```

Goose Control is intentionally smaller and can deliver the immediate clipboard-free Planner↔Goose loop without waiting for that larger architecture.

## Goose Control should not be throwaway work

Use an interface that can survive the later Orchestrator insertion.

Initially:

```text
Planner
  ↓
Goose Control
  ↓
one implementation Goose session
```

Later:

```text
Luke / User
  ↕
Planner
  ↓ same Goose Control contract
persistent Orchestrator
  ↓
Workers
```

The public control contract stays stable; only target resolution and the internal Goose topology evolve.

## Longer-term Planner / Orchestrator design

Preferred eventual topology:

```text
                    Luke / User
                        │
                        ▼
                ┌──────────────────┐
                │     Planner      │
                │ Persistent       │
                │ ChatGPT Web      │
                └────────┬─────────┘
                         │
                    Goose Control
                         │
                         ▼
                ┌──────────────────┐
                │   Orchestrator   │
                │ Persistent Goose │
                └────────┬─────────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Implementer   Reviewer   Researcher
             │           │           │
             └───────────┼───────────┘
                         ▼
                      Day Shift
                 role/model/provider

              separate reliability plane
                         │
                         ▼
                  Session Guardian
```

The Planner remains the strategic context. The Orchestrator owns operational decomposition and Worker coordination.

### Context membranes

Planner → Orchestrator packets should contain only what the operation needs:

```text
objective
new/relevant background
architectural constraints
acceptance criteria
authority
budget/provider policy
repository/working directory
known risks
stop conditions
```

Workers may return large logs to the Orchestrator. The Orchestrator should return to the Planner only:

```text
status
decisions made
material findings
artifacts / PRs
unresolved risks
next recommended action
```

This protects strategic context from operational noise.

## Revised implementation phases

### Phase 0 — proof current Goose control compatibility

Before implementing the external connector, test the **exact installed Goose version/environment**.

Determine:

1. whether `goose serve` can expose the required authenticated ACP surface;
2. whether that surface can list/load/address the same ordinary Goose sessions used by current Desktop/CLI workflows;
3. whether a long prompt can continue independently enough to support the gateway's async job wrapper;
4. whether native cancellation reliably stops that operation without terminating Goose or its browser host.

This is the highest-value technical spike.

### Phase 1 — one-target local control proof

Build the thinnest local-only adapter necessary to:

```text
one pre-approved target alias
  ↓
one already-running Goose session
```

No ChatGPT connector yet if a local test client can prove the control semantics first.

Prove exactly one instruction reaches exactly one Goose session and the canonical result can be retrieved.

### Phase 2 — Planner connector proof

Expose only:

```text
list_targets
submit_task
get_job
cancel_job
```

through the private ChatGPT-facing connector/tunnel boundary.

Use one approved continuation target.

### Phase 3 — async/idempotency hardening

Require:

```text
submit → job_id immediately
request_id deduplication
status/result retrieval
cancel
restart-safe job lookup
same-session busy handling
```

Default same-session concurrency policy: **fail closed as busy**. Do not invent queueing until real usage demonstrates a need.

### Phase 4 — aliases and additional approved targets

Add only the target metadata needed for real workflows across `goose-chatgpt-web`, Day Shift, review, or deployment contexts.

### Phase 5 — fresh-session creation

Only after the Electron/provider configuration is materially stable and native Goose session creation has been proven:

- introduce approved fresh-session profiles;
- validate project roots;
- keep provider/model selection policy server-side;
- preserve explicit `fresh` vs `continuation`.

### Phase 6 — dogfood before autonomous orchestration

Use Goose Control for real work long enough to identify which repeated decisions genuinely belong in a persistent Orchestrator.

Do not build the Orchestrator merely because the control plane makes it possible.

## First useful MVP acceptance criteria

The first end-to-end milestone is intentionally smaller than the earlier design.

It passes when:

1. The Planner addresses one pre-approved semantic target.
2. `submit_task` sends exactly one instruction to exactly one existing Goose session.
3. No prompt is copied by Luke.
4. Submission returns a stable `job_id` without holding the Planner open for the entire Goose task.
5. Goose continues under its normal tools, approvals, delegation, and provider configuration.
6. A later `get_job(job_id)` returns terminal status and the canonical Goose result.
7. No result is copied by Luke.
8. The Planner can assess that result and submit a continuation to the same target.
9. Retrying the same `request_id` cannot execute the task twice.
10. A mismatched reuse of `request_id` fails closed.
11. A busy target fails closed rather than silently overlapping work.
12. `cancel_job` cancels the Goose operation without terminating Goose, Electron, Chromium, or the ChatGPT-Web browser host.
13. Goose Control exposes no arbitrary shell/file/credential/browser/process authority.
14. Existing Goose Native behavior remains unchanged.
15. Existing Secure MCP Tunnel identity is not casually replaced.

Successful UX:

```text
Luke → Planner: "continue with the next milestone"
Planner → Goose Control: submit_task(...)
Goose works independently

Luke later → Planner: any new message
Planner → Goose Control: get_job(...)
Planner judges the result
Planner → Goose Control: submit_task(... continuation ...)
```

with **zero prompt/output copying by Luke**.

## Known non-goals / already-decided questions

Do not reopen these unless new evidence changes the premise:

- **Browser host:** Goose Control addresses Goose, not managed Chrome or Electron.
- **General admin API:** not needed for MVP.
- **Same-session concurrency:** fail closed as busy initially; no queue.
- **Arbitrary provider/model selection:** not exposed to the Planner initially.
- **Fresh-session creation:** not required for first proof.
- **Automatic Planner wake-up:** later event-driven orchestration problem.
- **Session Guardian:** separate reliability plane.
- **Planner vs Orchestrator:** keep separate.
- **Goose Native vs Goose Control:** separate semantics; reuse only suitable exposure/auth plumbing.
- **Output default:** return canonical final Goose result plus concise status/metadata; do not dump full logs unless explicitly requested and authorized.

## Genuine questions remaining

These are the questions that still need evidence rather than more architectural discussion.

### Must answer before the MVP

1. **Can the exact Goose version/environment Luke runs expose and address the same ordinary Desktop/CLI sessions through `goose serve` ACP?**  
   Upstream ACP persists sessions into Goose history, but the required interoperability with the current long-lived ordinary Goose workflow should be proven live rather than assumed.

2. **What is the cleanest native way to submit to an existing session and later recover the completed result without keeping the original client request open?**  
   If current ACP/session APIs already expose sufficient detached execution/state, use them. Otherwise Goose Control may own only the minimal async wrapper/job ledger around native Goose execution.

3. **What exact ChatGPT connector/custom-app action surface can this Planner use for authenticated writes to the local Goose Control gateway?**  
   Re-check the current ChatGPT custom-app/MCP action model and the existing Secure MCP Tunnel behavior at implementation time. Reuse the proven private tunnel pattern where possible, but do not expose the raw `goose serve` secret or unrestricted ACP endpoint.

4. **What is the correct cancellation mapping for a detached async job in the exact Goose version used?**  
   It must cancel the intended Goose operation reliably and leave the Goose host and ChatGPT-Web browser host alive.

### Can be answered during implementation, not before starting

5. **How little persistent state does the gateway need for restart-safe `job_id` and `request_id` recovery?**  
   Prefer the smallest durable mechanism that meets the acceptance tests; do not pre-commit to a database or custom service architecture.

6. **Which result fields are needed beyond the canonical final Goose response for the Planner to make good next-step decisions?**  
   Start with status, target/session identity, timestamps, final result/error, and only add richer evidence when real workflows require it.

7. **When does real usage justify a persistent Orchestrator target instead of direct Planner → execution-session control?**  
   This is a product/workflow threshold, not an MVP blocker. Dogfood should answer it.

## Priority / stop boundary

This plan remains **documentation/deferred**.

This document does not authorize:

- implementing Goose Control immediately;
- enabling hidden Orchestrator/Palmate features in production;
- exposing `goose serve` publicly;
- changing the current Electron/browser-host migration;
- altering Day Shift;
- building Session Guardian;
- introducing a persistent Orchestrator;
- granting new local-machine authority to ChatGPT;
- restarting or disrupting a Goose process hosting an active agent session.

When Goose Control is explicitly prioritized, begin with **Phase 0 — proof current Goose control compatibility** and keep the first proof on one already-running approved Goose target.
