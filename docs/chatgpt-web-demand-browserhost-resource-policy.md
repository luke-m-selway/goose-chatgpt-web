# ChatGPT-Web demand-start resource policy

Status: **design-only supplement for draft PR #33**. No runtime behavior changes are authorized by this file.

This document records the resource/ownership decision for provider-demand BrowserHost startup.

## Goal

Minimize computer resources when ChatGPT-Web is not being used while preserving a simple, reliable Goose-native lifecycle.

`goose-chatgpt-web` exists to serve Goose. If no other consumer is using the runtime, components should not remain alive solely after Goose has exited.

## Preferred lifecycle

```text
Goose closed
  -> no ChatGPT-Web processes kept alive solely for Goose

Goose open, ChatGPT-Web unused
  -> keep only the minimum ingress/control component required for lazy activation
  -> avoid eagerly running Electron/Chromium where a clean Goose lifecycle trigger permits it

first ChatGPT-Web use
  -> lazily ensure provider dependencies
  -> construct/reconstruct BrowserHost only when needed
  -> run the canonical readiness proof
  -> continue the original provider request if duplicate-submission safety is clear

subsequent ChatGPT-Web chats/turns
  -> reuse the healthy BrowserHost for the Goose application lifetime

Goose exits
  -> orderly ChatGPT-Web companion-runtime shutdown
```

## Why not start/stop per chat?

Goose creates/restores agents and loads extensions per session, but ChatGPT-Web is provider infrastructure, not a per-chat tool extension.

Starting and stopping Electron for every new Goose chat would:

- repeatedly pay Electron/Chromium startup cost;
- repeatedly exercise authentication/session readiness;
- create unnecessary descriptor/readiness races;
- make parent/child concurrency harder;
- provide little benefit if the user is actively using ChatGPT-Web across multiple chats.

Prefer **lazy first-use + reuse until Goose exits**.

## Smallest-idle component set

The exact smallest set depends on the Goose integration surface.

Preferred order:

1. If Goose exposes a clean provider/application lifecycle trigger that can start the whole ChatGPT-Web companion runtime only when ChatGPT-Web is selected, use it. This allows zero provider processes while Goose is open but ChatGPT-Web is unused.
2. Otherwise keep only a small Responses ingress/control component alive while Goose is open so the first provider request has somewhere to land, and demand-start the heavy BrowserHost from there.
3. Do not invent a second supervisor/orchestration framework solely to remove a small idle process.

Electron/Chromium is the component most worth avoiding when unused.

## Startup trigger

An incoming request to the ChatGPT-Web Responses provider is already strong evidence that Goose selected ChatGPT-Web and needs the runtime.

When BrowserHost is definitely absent/stale in a safely reconstructible way, reuse the existing canonical BrowserHost bootstrap/readiness primitive rather than shelling out to a second implementation.

Concurrent demand must be single-flight per runtime/BrowserHost owner.

## Shutdown trigger

The preferred shutdown boundary is the **Goose application lifetime**, not the individual chat lifetime.

If Goose provides a reliable app/provider shutdown event, use it to perform the existing orderly ChatGPT-Web lifecycle shutdown.

Shutdown must still respect active-turn/drain semantics; closing Goose should not corrupt an in-flight owned operation merely to save resources. Define how application exit coordinates with the current drain/cancellation contract before implementation.

## Deliberate operator stop

A deliberate `lifecycle stop` must remain meaningful. Provider demand must not immediately undo an explicit operator stop unless the lifecycle contract consciously defines Goose activity as permission to restart it.

Prefer existing lifecycle/service state to represent this distinction before introducing any new persistent marker.

## Do not conflate stale execution replay with BrowserHost absence

PR #31 diagnosed a separate defect after BrowserHost recovery: a genuine earlier descriptor-missing failure could be retained by the daemon's per-execution-key registry and replayed by identical later requests without rechecking the now-healthy BrowserHost.

That defect belongs to PR #31's execution/session identity repair.

Required separation:

- **true BrowserHost absence** -> PR #33 demand-start may reconstruct it;
- **healthy BrowserHost + stale settled provider error** -> PR #31 execution-registry problem;
- **send/composer/network/broker ambiguity** -> reliability classification, not automatic restart.

A fresh Goose chat/turn must have fresh provider execution identity even if prompt text is identical. Prompt equality is not an idempotency key.

## Non-goals

This policy does not propose:

- making ChatGPT-Web an MCP extension;
- starting/stopping Electron per chat;
- automatic browser restart on arbitrary failures;
- Goose Control lifecycle ownership;
- a second permanent supervisor;
- timeout/retry-budget changes;
- large-context transport changes from PR #32.

## Implementation decision still to inspect

Before code, inspect the actual Goose application/provider lifecycle to determine the lowest-resource native trigger available:

- provider selected/configured;
- first provider request;
- provider/session disposal;
- Goose desktop/application exit.

Choose the smallest native integration that can reliably implement lazy first-use and orderly application-lifetime shutdown without forking Goose lifecycle semantics unnecessarily.
