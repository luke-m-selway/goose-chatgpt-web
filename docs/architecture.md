# Architecture

This document describes the **current Goose-first target architecture**. Historical managed-Chrome and inherited desktop-supervisor designs are indexed under [`history/README.md`](history/README.md) and are not operator instructions.

## System shape

```text
Goose session
   │
   │ OpenAI-compatible Responses request
   ▼
standalone Responses daemon (loopback)
   │
   ├─ turn/session replay metadata
   ├─ capability broker (full mode)
   └─ browser-helper process
           │
           │ BrowserHost control + CDP
           ▼
   Electron BrowserHost
           │
           ├─ persistent authenticated ChatGPT partition
           └─ task-bound WebContentsView surface
                    │
                    ▼
             ChatGPT Temporary Chat

Full-mode tool return path:
ChatGPT → Goose Native → Secure MCP Tunnel → capability broker → Goose tool
       ← same browser response ← tool result ← Goose execution/approval
```

## Ownership boundaries

### Goose

Goose is the outer harness and source of truth for:

- logical conversation/session history;
- tool registry and tool results;
- approvals/sandbox policy;
- native delegation/subagents;
- recipes/extensions;
- project execution;
- compaction and context lifecycle.

A browser conversation is transport state, not the durable Goose conversation.

### Responses daemon

The standalone daemon:

- exposes the loopback Responses-compatible provider surface used by Goose;
- translates Goose requests into browser turns;
- retains only the bounded replay/session metadata needed to resume a logical browser turn across native tool-result rounds;
- owns the browser-helper client process;
- hosts the capability broker/MCP server in full mode;
- exposes authenticated lifecycle controls for its own service state.

The daemon does not own Electron or the Secure MCP Tunnel.

### Electron BrowserHost

Electron owns only browser infrastructure:

- the persistent authenticated ChatGPT partition;
- task-bound `WebContentsView` surfaces;
- a loopback BrowserHost control endpoint;
- a loopback CDP endpoint;
- surface leasing/release and browser-host health/recovery.

Standalone Electron must not adopt, restart, drain, or stop the Responses daemon or tunnel.

### Browser helper

The daemon spawns the browser helper. The helper leases the exact BrowserHost surface for a turn, attaches over CDP, performs the ChatGPT Web UI automation, streams visible response state, and returns the result to the daemon.

The helper is a client of BrowserHost, not BrowserHost's supervisor.

### Secure MCP Tunnel

The tunnel is independently supervised. It provides the outbound ChatGPT connector transport used in full mode and owns its own MCP child/runtime. Restarting only the Responses daemon does not refresh a persistent tunnel-owned MCP child after a connector schema change.

## Browser-turn lifecycle

Each new logical Goose user turn normally receives a fresh ChatGPT Temporary Chat. Goose sends the accumulated context it wants the provider to see; physical reuse of a ChatGPT conversation is unnecessary.

For a tool-capable response:

1. the daemon creates one browser-turn session and one bounded turn capability;
2. ChatGPT can request an action through `Goose Native`;
3. the daemon returns the request as a normal provider tool call;
4. Goose executes/approves the tool;
5. Goose sends the matching tool result in the next provider round with the same native turn identity;
6. the daemon resumes the same active browser response rather than opening another logical turn;
7. completion revokes the capability and releases the BrowserHost surface.

Volatile outer-harness metadata that changes across provider rounds must not change logical turn identity.

## BrowserHost surface contract

BrowserHost readiness is stronger than “Electron has a PID” or “CDP is listening.” A usable host must be able to:

1. accept an authenticated turn lease;
2. create/reuse the task-bound `WebContentsView`;
3. inject the exact surface identity into the renderer;
4. expose that renderer as a CDP target;
5. allow the browser helper to select the exact leased surface;
6. release the surface cleanly at terminal turn state.

A control plane that can mint leases while its renderer path is dead is degraded and must not advertise usable readiness.

## Response lifecycle

The worker treats ChatGPT UI state as an unstable external interface and uses bounded stage contracts for navigation, composer readiness, effort selection, attachments, send acceptance, response health, completion, and cleanup.

Browser automation must fail explicitly on UI drift. It must not silently choose another model, reasoning mode, browser transport, or provider.

The Electron surface can be hidden or not frontmost; therefore response watching must preserve whatever Chromium/Electron lifecycle state is required for the task surface to remain active. This is still under final live qualification and is tracked in the active roadmap.

## Modes

### Browser-only

- routes selected ChatGPT-Web models through the browser;
- exposes no local Goose tools through the custom connector;
- creates no turn capability for local actions.

### Full

- uses the `Goose Native` connector through the Secure MCP Tunnel;
- exposes only tools advertised by the active Goose turn;
- keeps Goose as executor/approval authority;
- revokes the browser-turn capability on completion/abort/failure.

## Runtime lifecycle

The currently proven cold dependency order is:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

See [`runtime-lifecycle.md`](runtime-lifecycle.md) for the qualified development sequence and readiness criteria.

The final product should encode this into one canonical BrowserHost supervisor/startup mechanism so manual recovery, post-login startup, and first-use recovery cannot construct the stack differently.

## Managed Chrome

Managed Chrome was the initial browser transport and remains useful fallback/reference code. It is not the target primary BrowserHost architecture. Historical findings about stale-handle recovery remain relevant engineering evidence, but managed-Chrome start/restart behavior must not be projected onto Electron.

## Security invariants

- Responses/control/CDP listeners remain loopback-only.
- Browser authentication state and tunnel credentials remain private local state.
- Lifecycle control uses scoped authenticated endpoints where applicable.
- Tool authority originates from the active Goose turn, not user-authored prompt text.
- A model cannot silently widen the tool registry or sandbox.
- Unsupported model/effort/tool combinations fail explicitly.
- The bridge does not retry or switch transports to evade ChatGPT usage limits.

See [`security-model.md`](security-model.md).
