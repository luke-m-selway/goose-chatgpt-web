# Goose Control — deferred proposal

Status: **deferred; not current runtime documentation.**

Goose Control is a planned Planner-facing control connector/gateway that can submit bounded work into approved existing Goose sessions and retrieve job state/results without manual copy/paste.

It is architecturally separate from the ChatGPT-Web BrowserHost transport:

```text
Planner
  → Goose Control connector
  → Secure MCP Tunnel
  → narrow local gateway
  → existing Goose ACP/session boundary
  → approved Goose session
```

Goose remains the session/execution authority. Goose Control must not become a second agent runtime or a browser-host supervisor.

## Why this file is intentionally short

The earlier detailed plan mixed active runtime facts, exploratory architecture, and transition-period terminology. That made it too easy to treat a deferred proposal as current operating documentation.

The exact pre-cleanup version remains preserved in Git history at commit `76941119f33ec359c1d4b4b47f4d5c7df5b91c74`.

The actively refined deferred design is maintained in **draft PR #25**. Resume from that draft only after the Electron BrowserHost reliability and deterministic startup milestones are complete.

## Current bounded MVP intent

When resumed, the intended first surface remains narrow:

- list approved targets;
- submit one task to an approved Goose session;
- query asynchronous job state/result;
- cancel through Goose's native session cancellation boundary;
- preserve Goose as the source of truth for conversation/session state.

No implementation work on Goose Control should be used to work around unresolved ChatGPT-Web BrowserHost reliability.
