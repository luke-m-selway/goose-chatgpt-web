# Goose Control — deferred planner-to-Goose control bridge

Status: **auxiliary design note / deferred; not an active implementation milestone**  
Captured: **2026-08-10**  
Last scoped: **2026-08-11**  
Purpose: preserve the smallest Goose-native design for removing the manual Planner↔Goose clipboard relay.

## Goal

`goose-chatgpt-web` already proves the execution direction:

```text
Goose
  ↓ provider request
goose-chatgpt-web
  ↓
ChatGPT Web
```

Goose remains the harness: it owns conversation state, tools, local execution, approvals, delegation, recipes, provider configuration, and session persistence.

The remaining usability problem is the planning/execution boundary. Luke often reasons in a separate persistent ChatGPT planning conversation, then manually copies a bounded instruction into Goose and later copies Goose's result back into the Planner.

**Goose Control** removes only that human transport layer.

First useful experience:

```text
Luke ↔ ChatGPT Planner
          │
          │ Goose Control
          ▼
     approved Goose session
          │
          ▼
     normal Goose execution
```

Luke should not need to copy either prompts or results or remember raw Goose session IDs.

## Canonical roles

Use these technical names:

```text
Luke / User
Planner
Orchestrator
Workers
Session Guardian
Goose Control
```

Corporate titles are analogy only:

```text
Luke / User   ≈ CEO / owner / final authority
Planner       ≈ Chief of Staff / strategic adviser
Orchestrator  ≈ COO / operational manager
Workers       ≈ execution teams
```

Do not derive software authority or routing rules from that analogy.

## Core boundary — Goose, not the browser host

**Goose Control addresses Goose sessions, not ChatGPT browser sessions.**

```text
Luke
  ↕
ChatGPT Planner
  │
  │ separate Goose Control MCP app
  ▼
Secure MCP Tunnel
  │
  ▼
Goose Control gateway
  │
  │ authenticated loopback ACP
  ▼
goose serve
  │
  ▼
Goose session
  │
  ├── tools / approvals / delegation / Workers
  │
  └── provider
        │
        └── ChatGPT Web
              │
              └── browser host
                    ├── managed Chrome (legacy)
                    ├── Electron Chromium
                    └── future qualified host
```

The managed-Chrome → Electron migration therefore does not redefine Goose Control.

Do not make Goose Control depend on Electron window IDs, Playwright pages, CDP targets, ChatGPT URLs, browser-helper state, or browser-host process identity.

The repository's `launcher/electron/control-server.cjs` belongs to the browser/runtime reliability plane. It is **not** Goose Control.

## Goose Control is not Goose Native

### Goose Native

```text
active ChatGPT-Web provider turn
  ↓
Goose Native connector
  ↓
Goose-owned tools / delegation for that turn
```

The current `goose-native` MCP contract is intentionally scoped to one active outer-harness turn. Its tools require the random `turn_token` supplied to that provider turn and route through the turn broker. Authority expires with the turn.

### Goose Control

```text
persistent ChatGPT Planner
  ↓
Goose Control
  ↓
approved Goose sessions / jobs
```

The Planner is not inside an active Goose provider turn and should not possess a Goose Native turn token.

Therefore **Goose Control should be a separate logical MCP app/server identity**, not extra tools added to the existing `goose-native` MCP server.

Reuse suitable infrastructure — especially the private Secure MCP Tunnel pattern — but do not reuse Goose Native's turn-token authority semantics or public tool contract. This keeps the management plane least-privileged and prevents cross-session authority from leaking into ordinary ChatGPT-Web provider turns.

## Documentation-derived design decisions — Goose 1.45.0

The installed Goose version is 1.45.0. Review of that exact tag answers most of the questions that were previously left for a development spike.

### 1. ACP is the native client/control boundary

Goose's own custom-distribution architecture places CLI, Desktop, and custom clients above `goose serve (ACP)`, with Goose Core below it.

Goose Desktop 1.45.0 itself starts `goose serve` on loopback with a generated secret and connects to its `/acp` endpoint.

**Decision:** use `goose serve` ACP as the Goose Control backend. Do not create another Goose session API and do not use browser control as a session API.

### 2. ACP can address ordinary persisted Goose sessions

In Goose 1.45.0:

- the ACP session ID maps directly to a row in Goose's `sessions` store;
- ACP `session/list` deliberately includes legacy `User` sessions as well as `Scheduled` and `Acp` sessions;
- ACP `session/load` looks up the supplied ID through Goose's normal `SessionManager`;
- CLI resume also resolves ordinary sessions through that same `SessionManager`;
- loading a persisted session preserves its stored provider/model when those values already exist.

This is enough to settle the architecture question: **ACP is designed to load the same persisted Goose session identity used outside ACP.**

A future live check against Luke's exact long-lived ChatGPT-Web-backed session remains worthwhile, but only as an integration smoke test — not an architecture/research spike.

#### Working-directory safety

`session/load` accepts a `cwd`, and Goose may update the persisted session working directory if the supplied value differs from the stored value.

ACP `session/list` returns the session's working directory. Therefore Goose Control should load an existing target using its **persisted/listed cwd**, not a Planner-supplied cwd. The Planner should not be allowed to mutate an existing target's working directory through `submit_task`.

### 3. Native ACP `session/prompt` should execute the task

Goose 1.45.0 already provides the execution lifecycle Goose Control needs:

```text
session/prompt
  ↓
create active run + CancellationToken
  ↓
Agent.reply(...)
  ↓
stream normal Goose messages/tool activity
  ↓
persist messages through SessionManager
  ↓
EndTurn | Cancelled
```

Only one active prompt run is allowed per session. A second run fails closed as busy.

**Decision:** do not implement a second asynchronous execution engine inside Goose and do not expose the hidden Orchestrator merely to send a message.

The Goose Control gateway should start a normal ACP `session/prompt` in a background task that it owns. `submit_task` returns a Goose-Control `job_id` immediately while that background task continues awaiting the ordinary ACP turn.

The custom asynchronous concept is therefore only the **Planner-facing job handle**. Goose execution itself remains entirely native.

### 4. Cancellation maps directly to ACP `session/cancel`

Goose 1.45.0 tracks the active run's `CancellationToken`. ACP cancellation finds that active run by session ID and cancels its token.

**Decision:**

```text
cancel_job(job_id)
  ↓ resolve job → session
ACP session/cancel
```

Never implement cancellation as process termination, Electron shutdown, Chromium shutdown, Goose restart, or browser-host restart.

A future live smoke test should verify that the ChatGPT-Web provider bridge responds cleanly to this normal Goose cancellation path, but the control-plane mapping is settled.

### 5. Fresh sessions should use ACP `session/new`

Goose 1.45.0 `session/new` already creates a normal persisted session through `SessionManager`, validates an absolute cwd, loads extensions/recipes, resolves provider/model configuration, activates the ACP session, and returns the new session ID.

**Decision for the later `fresh` mode:** use native ACP `session/new`, not Orchestrator `start_agent` and not a custom session constructor.

Goose Control should map a small **server-side approved profile** to cwd/recipe/provider policy. The Planner should not directly choose an arbitrary filesystem path or arbitrary provider/model.

Fresh creation is still unnecessary for the first MVP; continuation against one approved existing session proves the clipboard-free loop with less authority.

### 6. Same-session concurrency needs no custom queue

Goose's ACP server already rejects a second active prompt for the same session.

**Decision:** surface this as `busy`/conflict and fail closed. Do not add a Goose-Control queue until real use demonstrates a reason to override the native one-run-per-session model.

### 7. Goose remains the conversation source of truth

During `session/prompt`, Goose persists the conversation through its normal `SessionManager`. ACP session load/replay can reconstruct user-visible history, including message identity/metadata.

The ACP server's active-run registry, however, is in memory and does not provide Goose Control's caller-generated `request_id` or at-most-once semantics.

**Decision:** Goose Control owns only a tiny durable correlation/idempotency ledger. It must not duplicate the Goose conversation or modify Goose's private session database schema.

Minimum durable record:

```text
request_id        # unique caller idempotency key
payload_hash      # reject same id with different instructions
gateway_job_id
target_alias
session_id
state
submitted_at
completed_at?
final_message_id?
error?
```

Where practical, recover the canonical result from Goose's persisted session/message rather than treating a copied result blob as a second conversation store. Caching the final projected result for convenience is acceptable, but Goose remains authoritative.

### 8. Authenticated loopback ACP stays behind the gateway

Goose 1.45.0 requires `GOOSE_SERVER__SECRET_KEY` for a normal `goose serve` deployment and supports authenticated ACP requests using the secret. Goose Desktop itself uses a loopback server pattern.

**Decision:**

- keep `goose serve` loopback/private;
- authenticate gateway→Goose ACP;
- never expose the Goose server secret to the Planner;
- never expose unrestricted raw ACP directly through the ChatGPT connector;
- never use `--dangerously-unauthenticated` for the real control path.

The external ChatGPT-facing boundary remains the much narrower Goose Control MCP app.

## Why not use the hidden Orchestrator as the transport?

Goose's built-in Orchestrator is valuable for later operational management, but it is not the most native transport boundary for Goose Control.

It offers session list/view/start/send/interrupt tools, but current `send_message` is synchronous and the extension carries broader orchestration semantics than the Planner connector needs.

ACP is Goose's explicit client protocol, is already used by Desktop/custom clients, directly addresses persisted sessions, and already supplies prompt/cancel/session lifecycle semantics.

**Decision:** ACP is the backend protocol. The future persistent Orchestrator may become a **target session behind Goose Control**, not the protocol Goose Control is built around.

## Minimal Planner-facing API

Keep the public MCP surface deliberately smaller than ACP:

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

For the first MVP:

```text
mode = continuation
```

`fresh` becomes available only after approved session profiles are implemented.

Do not initially expose:

- arbitrary raw session listing;
- arbitrary `session/new`;
- arbitrary cwd;
- arbitrary provider/model selection;
- shell or file APIs;
- browser/CDP APIs;
- process management;
- tunnel administration;
- Goose lifecycle operations.

## Async/idempotency semantics

`submit_task` must return without holding the ChatGPT Planner tool call open for the entire Goose turn.

Internally:

```text
submit_task
  ↓ validate target + request_id
  ↓ persist pending/running ledger entry
  ↓ launch background ACP session/prompt
  ↓ return job_id

background task
  ↓ collect normal ACP stream
  ↓ record terminal state/final message identity

later get_job(job_id)
  ↓ return projected canonical result
```

### At-most-once submission

`request_id` is mandatory.

If connector/tunnel/network ambiguity causes a retry, the same `request_id` and same payload must return the existing job. It must not create a second Goose prompt.

The same `request_id` with materially different target/mode/instructions must fail closed.

Persist the idempotency record **before** initiating the ACP prompt so a retry cannot race ahead of the ledger.

## Target aliases

The Planner addresses approved semantic targets, for example:

```text
goose-chatgpt-web:implementation
  → persisted Goose session ID + expected project/cwd

day-shift:implementation
  → persisted Goose session ID + expected project/cwd
```

Required properties:

- deterministic;
- server-controlled;
- visible project/purpose;
- no silent guessing;
- fail closed on unknown/ambiguous/stale mapping;
- validate the resolved session's persisted cwd/project metadata before writing.

The Planner should not need raw IDs in ordinary use.

## Result projection

Default `get_job` should return enough evidence for strategic reasoning without dumping operational noise:

```text
job_id
state
target
session_id
submitted_at
completed_at?
result?        # canonical final user-visible Goose assistant result
error?
```

Do not return full tool logs by default.

If later workflows need richer evidence, add an explicit bounded inspection operation rather than making every completed job copy the whole Goose transcript into the Planner context.

## Planner availability

The connector can remove prompt/output copying but cannot by itself initiate a brand-new ChatGPT Planner turn after that conversation has finished responding.

Expected intermediate UX:

```text
Luke → Planner: start task
Planner → Goose Control: submit_task(...)
Planner → Luke: accepted / running

Goose completes independently

Luke → Planner: any later message
Planner → Goose Control: get_job(...)
Planner evaluates result
Planner → Goose Control: next continuation if appropriate
```

The Planner should opportunistically check relevant pending jobs on later normal turns. Automatic wake-up belongs to a later event-driven orchestration layer.

## Security / authority

Allowed in the MVP:

```text
✓ list approved semantic targets
✓ submit bounded text to an approved target
✓ read state/result for Goose-Control jobs
✓ cancel a Goose-Control job through ACP cancellation
```

Potentially later:

```text
△ create a fresh session from an approved server-side profile
△ inspect bounded approved session metadata
```

Disallowed directly through Goose Control:

```text
✗ arbitrary shell execution
✗ arbitrary file reads/writes
✗ credentials/keychain access
✗ browser/CDP control
✗ broad process killing
✗ Goose-host lifecycle disruption
✗ arbitrary cwd
✗ arbitrary provider/model spending
✗ tunnel administration
```

If an implementation task needs shell/files/tools, the receiving Goose session uses its normal configured permissions and approvals.

## Longer-term Planner / Orchestrator evolution

Do not merge Planner and Orchestrator merely to eliminate copy/paste.

The stable future shape can remain:

```text
Luke / User
    ↕
Planner
    │
Goose Control
    │
Orchestrator        # later persistent Goose target
    │
Workers / Day Shift

Session Guardian    # separate reliability plane
```

The Planner keeps strategic context. The Orchestrator, when justified by real usage, owns operational decomposition/review/Worker coordination. Goose Control's public contract does not need to change; only the target behind an alias changes.

## Revised implementation path

Documentation now settles the main architecture. Do **not** spend a future milestone rediscovering it.

### Phase 0 — bounded native-ACP smoke test

No new architecture work.

Against the exact installed Goose 1.45.0 environment, prove with a harmless test target that:

1. authenticated loopback `goose serve` is reachable;
2. ACP `session/list` sees the intended ordinary `User` session;
3. `session/load` loads it using its persisted cwd without changing provider/model;
4. a bounded `session/prompt` appends exactly one normal turn and returns its result;
5. a deliberately cancellable test prompt stops through ACP `session/cancel` while Goose and the ChatGPT-Web browser host remain alive.

These are regression/integration checks of documented behavior, not design questions.

Do not perform the cancellation test against the active Goose process/session hosting the agent running the proof.

### Phase 1 — local thin gateway

Implement only:

- one hard-approved target alias;
- ACP list/load/prompt/cancel client behavior;
- tiny durable `request_id`/job ledger;
- result projection;
- fail-closed busy handling.

No ChatGPT connector is required to prove this local layer.

### Phase 2 — Planner-facing MCP capability smoke

Create the separate narrow Goose Control MCP app/server identity and connect it through the private Secure MCP Tunnel pattern.

Verify the actual ChatGPT account/workspace can invoke its write-capable `submit_task`/`cancel_job` actions and record what confirmation behavior applies.

Do not merge these tools into `Goose Native` merely to avoid this product-surface check.

### Phase 3 — one-target MVP

Prove the complete clipboard-free loop:

```text
Planner submit_task
  → job_id immediately
Goose works
Planner later get_job
  → canonical result
Planner submit_task continuation
```

with idempotent retries and no prompt/output copying by Luke.

### Phase 4 — approved fresh-session profiles

Use native ACP `session/new` behind server-side profiles. Add only the profiles real workflows require.

### Phase 5 — dogfood before more orchestration

Use Goose Control for real work before adding a persistent Orchestrator, autonomous wake-ups, richer job APIs, or custom scheduling.

## MVP acceptance criteria

The first useful milestone passes when:

1. Planner addresses one approved semantic target.
2. Exactly one `submit_task` instruction becomes exactly one Goose turn.
3. Submission returns a stable `job_id` quickly.
4. Goose retains normal ownership of conversation, tools, approvals, delegation, provider, and persistence.
5. `get_job` later returns terminal state and the canonical result without Luke relaying it.
6. Planner can send a continuation to the same target.
7. Same `request_id` + same payload cannot execute twice.
8. Same `request_id` + different payload fails closed.
9. Same-session overlap surfaces busy/conflict rather than silently running concurrently.
10. `cancel_job` maps to ACP cancellation and does not terminate Goose/Electron/Chromium/browser host.
11. Existing Goose Native behavior remains unchanged.
12. Goose Control exposes no arbitrary shell/file/credential/browser/process authority.

## Questions documentation has now answered

Do not reopen these without contradictory new evidence:

- **Backend protocol:** native Goose ACP through `goose serve`.
- **Ordinary-session addressability:** ACP session IDs map to Goose persisted sessions; ACP list/load includes ordinary `User` sessions.
- **Execution primitive:** native ACP `session/prompt`.
- **Async shape:** gateway background task around ordinary ACP prompt; no second Goose execution engine.
- **Cancellation:** ACP `session/cancel`.
- **Same-session concurrency:** fail closed using Goose's native one-active-run rule.
- **Fresh-session mechanism:** ACP `session/new` behind approved profiles.
- **Conversation storage:** Goose remains authoritative.
- **Custom state:** only a tiny Goose-Control correlation/idempotency ledger.
- **Browser host:** below Goose Control and irrelevant to its public contract.
- **Orchestrator:** possible later target/manager, not the Goose Control transport.
- **Goose Native relationship:** separate logical MCP identity and authority model; reuse only suitable tunnel/plumbing.
- **Raw ACP exposure:** no; authenticated loopback ACP stays behind the narrow gateway.

## Genuine questions remaining

### Required live checks before relying on the MVP

1. **Can this actual ChatGPT Planner/account/workspace invoke the separate write-capable Goose Control MCP app through Secure MCP Tunnel, and what confirmation behavior applies?**  
   This is now a ChatGPT product-entitlement/permission check, not a Goose architecture question. Public ChatGPT documentation currently limits full custom-MCP write support by plan/workspace, while this project already has a proven private connector path. Verify the actual account/surface rather than designing around an assumption.

2. **Does a real ChatGPT-Web-backed Goose turn cancel cleanly through the documented ACP → Goose cancellation path?**  
   The Goose-side mapping is settled. The live test is only to verify the provider/browser bridge propagates that normal cancellation without disrupting the host.

### Non-blocking resilience question

3. **What happens if the Goose Control gateway/ACP client crashes or disconnects while `session/prompt` is still running?**  
   Normal async operation does not require a disconnect: the gateway keeps the ACP request alive in its background task. Before promising crash-surviving in-flight jobs, test whether the exact Goose/ACP transport continues or cancels an active prompt on client loss and define recovery accordingly. This is not required for the first clipboard-free MVP if gateway restart during an active job is documented as a recoverable failure boundary.

### Product question for later dogfooding

4. **When does real usage justify inserting the persistent Orchestrator?**  
   This should be answered from repetitive workflow evidence, not pre-implementation architecture work.

## Priority / stop boundary

This document remains **deferred design**, not authorization to implement Goose Control now.

It does not authorize:

- changing the current Electron/browser-host migration;
- enabling hidden Orchestrator/Palmate features in production;
- exposing `goose serve` publicly;
- altering Day Shift;
- building Session Guardian;
- granting arbitrary local-machine authority to ChatGPT;
- restarting or disrupting a Goose process hosting an active agent.

When Goose Control is explicitly prioritized, begin with the **bounded native-ACP smoke test**, not another architecture investigation.