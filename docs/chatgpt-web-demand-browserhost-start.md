# Provider-demand BrowserHost start

Status: **design-only**. This document preserves a lifecycle/UX direction discovered during ordinary Goose use. It does not authorize implementation or change current runtime behavior.

This branch is stacked on PR #31 (`fix/electron-native-liveness`) because the design depends on the current canonical Electron/BrowserHost lifecycle and reliability boundaries. It is separate from PR #32's large-context transport work.

## Problem

The ChatGPT-Web runtime currently has asymmetric supervision:

```text
launchd
├─ Responses daemon      supervised / KeepAlive
├─ Secure MCP Tunnel     supervised / KeepAlive
└─ Electron BrowserHost  bootstrap-only
```

The canonical lifecycle coordinator can reconstruct the BrowserHost, but ordinary ChatGPT-Web inference does not demand-start it.

A natural operator sequence exposed the UX gap:

1. Goose and Electron were closed manually.
2. The daemon and tunnel remained available.
3. A later fresh Goose chat selected ChatGPT-Web and sent a request.
4. The request reached the Responses daemon but failed because the launcher BrowserHost descriptor was absent.
5. Running the canonical lifecycle start path reconstructed Electron/BrowserHost and proved it ready.

This should not be treated as evidence that ChatGPT-Web concurrency or Goose logical session persistence failed. It is a startup/lifecycle gap: a provider request can arrive while its disposable browser execution surface is absent.

A later same-evening diagnosis also observed a descriptor-missing error while the descriptor subsequently existed and canonical readiness passed. That incident is still being diagnosed and must not be used here to overclaim a root cause. PR #31 remains the ecological incident ledger.

## Desired UX

Selecting ChatGPT-Web and sending the first message should be sufficient to make its provider runtime usable when the only missing component is the BrowserHost:

```text
new Goose session
    ↓
ChatGPT-Web selected
    ↓
first ChatGPT-Web request reaches Responses daemon
    ↓
BrowserHost already ready?
    ├─ yes → normal request
    └─ no, narrowly reconstructible
          ↓
       ensure BrowserHost ready
          ↓
       continue original request
```

No manual terminal command should be required for the ordinary case.

## Ownership decision

Do **not** make `goose-chatgpt-web` a Goose MCP extension merely to obtain a per-session startup trigger.

ChatGPT-Web is provider infrastructure, not a tool extension. The clean trigger already exists: an incoming request to the ChatGPT-Web Responses provider proves that Goose selected this provider and is attempting to use it.

Likewise, do not put this behavior in Goose Control. Goose Control remains provider-agnostic.

The preferred ownership is therefore:

```text
Goose
  → ChatGPT-Web provider request
      → Responses daemon
          → narrowly ensure BrowserHost availability when needed
```

## Reuse the canonical BrowserHost start contract

Do not duplicate lifecycle startup logic inside the request handler and do not shell out to a second orchestration layer.

The existing lifecycle path already owns the authoritative BrowserHost construction/readiness sequence:

1. bootstrap launcher/Electron when absent;
2. wait for saved ChatGPT session readiness/authentication;
3. lease one disposable lifecycle surface;
4. verify that exact surface through the descriptor-provided Node/Electron helper path;
5. release the lease in `finally`;
6. run the existing read-only BrowserHost probe.

Implementation should, if practical, factor this into one provider-native primitive conceptually similar to:

```text
ensureLauncherBrowserHostReady()
```

Both canonical `lifecycle start` and provider-demand startup should reuse that same primitive rather than maintaining two definitions of readiness.

This must not weaken the existing rule that Bun-direct Playwright/CDP is not authoritative for lifecycle readiness.

## Narrow trigger only

Provider-demand startup must not become generic automatic recovery.

Reasonable eligible evidence may include:

- configured launcher descriptor is genuinely absent;
- descriptor is structurally stale and points to a non-running BrowserHost process;
- another equally explicit no-owner state proven safe to reconstruct.

Explicitly **not** sufficient by itself:

- send timeout;
- composer timeout;
- ChatGPT-native connection interruption;
- slow generation;
- outer Responses/body failure;
- broker timeout;
- renderer/control ambiguity while a BrowserHost owner is still present.

Those remain reliability incidents to classify using PR #31 evidence, not automatic-restart signals.

## Single-flight startup

Concurrent requests must not race multiple BrowserHost reconstructions.

For example:

```text
parent request ─┐
child request  ─┼→ one shared BrowserHost-start attempt
other request  ─┘          ↓
                        READY / ERROR
                            ↓
                    waiting requests continue
```

The single-flight scope should be the configured runtime/BrowserHost owner, not each individual Goose session.

All waiters should receive the same original startup failure if reconstruction fails; do not replace the causal error with secondary retry noise.

## Operator stop semantics

A deliberate `lifecycle stop` must remain meaningful.

Before implementation, define how the daemon distinguishes:

```text
BrowserHost absent because the operator intentionally stopped the runtime
```

from:

```text
BrowserHost absent while the independently supervised daemon is accepting normal ChatGPT-Web work
```

Do not create a system where an explicit operator stop is immediately undone by an incidental request unless that is consciously made part of the lifecycle contract.

Possible solutions should prefer existing lifecycle/service state over adding new persistent state. Do not invent a second supervisor unless the existing contract cannot express the distinction cleanly.

## Daemon/tunnel boundaries

The common target case should reconstruct **BrowserHost only**.

If the request can already reach the Responses daemon, the daemon is necessarily running. In full mode the tunnel is independently supervised and should not be restarted merely because Electron was closed.

Provider-demand BrowserHost start must therefore preserve the current ownership topology rather than turning every first request into a full `lifecycle restart`.

## Failure and cancellation behavior

Before implementation, specify at least:

- what happens if the client cancels while waiting for BrowserHost startup;
- whether a completed BrowserHost startup remains available even if the initiating request disappears;
- how startup timeout/error propagates to all single-flight waiters;
- how an unhealthy partial bootstrap is cleaned up using existing supported lifecycle logic;
- how the next request behaves after a failed startup attempt.

Do not add open-ended retries.

## Relationship to ecological reliability work

PR #31 remains authoritative for timestamped natural incidents and evidence correlation.

This design PR should not become a duplicate incident ledger. If a future natural incident changes this design materially, preserve the raw evidence in PR #31 first and reference it here only to update a design decision.

The current passive recorder remains observational only and must not acquire startup/recovery authority as part of this feature.

## Non-goals

This design does not propose:

- making ChatGPT-Web a Goose extension;
- adding ChatGPT-Web recovery logic to Goose Control;
- restarting Electron on arbitrary provider failures;
- changing timeout or retry budgets;
- changing parent/child concurrency policy;
- changing Goose logical-session ownership;
- changing ChatGPT-Web continuation/context transport;
- implementing PR #32 large-context externalization;
- supervising BrowserHost with a new permanent process manager.

## Smallest likely implementation slice

Once the current operational incident is understood and implementation is explicitly authorized, prefer a narrow slice:

1. extract/reuse the existing BrowserHost ensure/readiness primitive;
2. add a single-flight provider-demand call only for explicit absent/stale-owner cases;
3. preserve intentional-stop semantics;
4. add focused deterministic tests for absent, already-ready, concurrent, failed-start, and deliberate-stop cases;
5. validate one ordinary Goose first turn with BrowserHost initially absent.

Do not combine this with unrelated reliability repairs or PR #32 implementation.

## Questions to settle before code

- What exact no-owner states are safe to auto-reconstruct?
- What existing lifecycle/service state can represent an intentional stop without new machinery?
- Where is the narrowest provider-side call site that runs before browser leasing but after the request is known to be ChatGPT-Web?
- Can the existing lifecycle BrowserHost bootstrap be factored without changing its proven readiness semantics?
- What cancellation semantics should the single-flight promise have?
- Should a failed first request be automatically resumed after startup, or should startup be completed and the caller receive a retryable error? Prefer continuation of the original request only if it can be done without ambiguous duplicate submission.

The target principle is simple:

> A ChatGPT-Web request may lazily reconstruct a definitely absent disposable BrowserHost, but it must never turn ambiguous provider failure into an automatic browser restart.
