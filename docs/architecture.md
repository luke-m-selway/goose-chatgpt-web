# Architecture

Status: **current/proven** for the existing provider path described first; the integrated ChatGPT-Web application is the **active planning/design direction** and is not yet implemented or qualified.

## Current/proven runtime shape

```text
Goose
  │ custom ChatGPT-Web Responses provider
  ▼
Responses daemon (independently supervised, loopback)
  │
  ├─ bounded response/turn replay state
  ├─ capability broker in full mode
  └─ browser helper
          │ BrowserHost control + Playwright/CDP
          ▼
  Electron BrowserHost
          │ authenticated task-bound surface
          ▼
  ChatGPT Temporary Chat

Full-mode tool path:
ChatGPT → Goose Native → Secure MCP Tunnel → active Goose tool contract
       ← same browser response ← tool result ← Goose execution/approval
```

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`). It is diagnostic-only on top of qualified behavioral baseline `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8`.

## Durable Goose boundary — preserve through redesign

Goose remains authoritative for:

- logical conversation/session state and history;
- tools and approvals;
- delegation/subagents;
- project execution;
- compaction/context lifecycle.

ChatGPT browser chats remain disposable transport/cache state. The integrated application must **not** become the durable agent or a second conversation authority.

## Current component ownership

Today:

- Responses daemon owns the loopback provider surface, bounded replay/turn correlation, broker and browser-helper process;
- Electron owns the authenticated ChatGPT partition, task-bound browser surfaces, BrowserHost control and CDP endpoints, and BrowserHost-local cleanup;
- Secure MCP Tunnel is independently supervised and carries `Goose Native` connector calls back to the active Goose turn.

Those are current implementation facts. The earlier rule that these three components must remain independently top-level-owned is **superseded as an architectural constraint**.

## Active north-star design — self-contained ChatGPT-Web provider application

Target boundary to design and review:

```text
┌─────────────────────┐
│        Goose        │
│                     │
│ sessions/history    │
│ context/compaction  │
│ tools/approvals     │
│ orchestration       │
│ delegation          │
└──────────┬──────────┘
           │ stable provider contract
           │ preferably Responses-compatible HTTP/SSE
           ▼
┌──────────────────────────────────────┐
│     ChatGPT-Web Application          │
│         Electron today               │
│                                      │
│ one top-level owner/supervisor of:   │
│ - Responses/provider endpoint        │
│ - authenticated ChatGPT browser      │
│ - browser surfaces/automation        │
│ - provider execution state           │
│ - ChatGPT-specific retry/recovery    │
│ - Goose Native bridge                │
│ - MCP server / secure tunnel         │
│ - helper children if still useful    │
│ - health/readiness                   │
│ - startup/shutdown/reconstruction    │
└──────────────────────────────────────┘
```

Process separation is still allowed where useful. The simplification is **ownership/lifecycle encapsulation**, not forced single-process monolithism.

The stable Goose-facing boundary, not Electron itself, provides replaceability. If Electron later proves unsuitable, replace the whole ChatGPT-Web provider application behind that contract.

## Provider protocol vs ACP vs MCP

ChatGPT-Web is primarily a Goose **model provider**. Do not adopt ACP as the primary Goose↔ChatGPT-Web boundary merely because ACP is an agent protocol.

The existing Responses-compatible HTTP/SSE provider surface is the default candidate to preserve in Phase 1 unless scouting shows a materially better native Goose provider contract.

MCP/Goose Native remains appropriate for the reverse tool path:

```text
ChatGPT Web
  → Goose Native
      → application-owned MCP/tunnel machinery
          → active Goose tool contract
```

The redesign should internalize ownership of that machinery without changing Goose's tool/approval authority.

## Browser-control boundary under review

Current production-critical browser path uses external Playwright attached over CDP to Electron-owned surfaces.

Recent diagnostics, especially trace `df0fa0069ad9`, justify re-examining that boundary: Electron main-loop/control and renderer activity could remain healthy while shared Playwright/CDP operations stalled for tens of seconds. This does **not** prove that CDP itself is universally causal.

Phase 1 should preserve as much existing browser behavior as practical while consolidating lifecycle ownership.

A later Phase 2 may migrate browser-control stages incrementally to Electron-owned facilities where evidence supports simplification, including `webContents`, native navigation/load events, trusted input, narrowly scoped `executeJavaScript`, `session.webRequest`, preload/contextBridge, or `webContents.debugger` as an intermediate path. Do not replace Playwright auto-waiting with brittle home-grown polling merely for architectural purity.

Security requirements remain:

- `contextIsolation` retained;
- no generic Node/IPC capability exposed to remote ChatGPT content;
- narrow purpose-built preload/IPC only where justified;
- loopback/private runtime surfaces retained;
- browser/UI drift fails closed.

## Reliability invariants to transplant, not discard

Any ownership or browser-control redesign must preserve the qualified guarantees already established for:

- CGW-009 exact-once submission;
- semantic Markdown reconciliation (Gate 2A);
- exact thread-error classification (Gate 2B);
- CGW-017 progress-vs-liveness handling;
- CGW-007 retry-claim responsiveness;
- residual transport-terminal execution retirement;
- execution identity, tool continuation and browser-surface cleanup contracts.

Prefer transplanting these invariants into simpler ownership rather than carrying every old mechanism forward unchanged.

## Parallel migration / rollback architecture

The integrated application must be developed alongside the existing provider path rather than by destroying it first.

```text
existing `0b89d5e` path  ── retained baseline / rollback

integrated app path       ── built and qualified independently
```

Only after integrated startup/readiness, read-only turn, tool-capable turn, continuation, quit/reopen reconstruction and cutover gates pass should it become normal. Retain the previous path briefly as rollback, then delete independent-supervision machinery deliberately.

The design and Opus review should reject any approach that requires ChatGPT-Web to be unavailable throughout the rebuild.

## Resource policy

Primary objective:

```text
one application
one owner
one restart boundary
one readiness contract
```

Secondary objective: minimize idle resources only where that remains simple inside the single owner. Demand-start is an optimization, not a reason to recreate independent top-level infrastructure.
