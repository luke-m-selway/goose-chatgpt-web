# Standalone Goose runtime lifecycle

Status: **operational contract under final Electron qualification.** The sequence below was proven end to end on 2026-08-12 against the active Electron reliability work. This documentation PR must remain draft until the corresponding BrowserHost shutdown/reliability changes are checkpointed and the commands below are revalidated from the merged revision.

This is the authoritative lifecycle model for the standalone Goose deployment. Do not reconstruct it from generic launcher scripts or inherited desktop-app behavior.

## Ownership

Three independently owned runtime layers exist:

1. **Secure MCP Tunnel** — independently supervised outbound tool runtime.
2. **Electron BrowserHost** — owns only the authenticated browser partition, task-bound surfaces, control endpoint, and CDP endpoint.
3. **Responses daemon** — owns the loopback Responses API and spawns the browser helper that attaches to BrowserHost surfaces.

Goose itself is outside this process tree and must never be restarted by an agent running inside that Goose session.

Electron must not adopt or stop the daemon or tunnel in standalone mode.

## Proven dependency order

Cold startup:

```text
Tunnel ready
  → Electron BrowserHost genuinely ready
    → Responses daemon ready
      → Goose may submit ChatGPT-Web turns
```

Controlled shutdown is the reverse:

```text
Responses daemon stopped/drained
  → Electron BrowserHost stopped
    → Tunnel stopped
```

The dependency is about readiness, not merely process order. A PID, descriptor, or listening CDP socket alone does not prove that BrowserHost can serve a turn.

## Development runtime home

The currently qualified development installation uses:

```text
~/.goose-chatgpt-web-dev
```

Pass it explicitly with `--home` when operating the daemon/tunnel from the repository. Do not assume another user's runtime home.

## Controlled shutdown

### 1. Drain and stop the Responses daemon

```bash
bun run src/cli.ts service stop --home "$HOME/.goose-chatgpt-web-dev"
```

Require the service to unload and the Responses listener to disappear before continuing.

### 2. Stop the Electron BrowserHost

The current source entry point is the legacy-named `scripts/start-goose-launcher.ts`. Its actual role is **BrowserHost only** in bootstrap-only mode. It is foreground-blocking and therefore requires a persistent supervisor.

Terminate the known BrowserHost process with `SIGTERM`; the qualified bootstrap-only shutdown path must release browser state/control cleanly and remove the matching descriptor. Do not use broad process-kill commands.

The legacy filename is scheduled to become `scripts/start-browser-host.ts`; see [`naming.md`](naming.md).

### 3. Stop the tunnel

```bash
bun run src/cli.ts tunnel stop --home "$HOME/.goose-chatgpt-web-dev"
```

## Shutdown acceptance

Before declaring a cold state, verify all of the following:

- no Responses listener on the configured daemon port;
- daemon/helper processes gone;
- Electron BrowserHost gone;
- BrowserHost control/CDP listeners gone;
- no live BrowserHost descriptor;
- tunnel and its MCP child stopped;
- no unexpected project-owned runtime process remains.

If one layer fails to stop cleanly, diagnose that lifecycle boundary before starting anything again.

## Deterministic cold startup

### 1. Start and prove the tunnel

```bash
bun run src/cli.ts tunnel start --home "$HOME/.goose-chatgpt-web-dev"
```

Do not proceed until the tunnel reports all of:

- service loaded/running;
- `/healthz` healthy;
- `/readyz` ready;
- runtime state `ready`.

### 2. Start and prove the Electron BrowserHost

Current source command:

```bash
bun run scripts/start-goose-launcher.ts
```

Despite the filename, this does not start Goose. It starts the Electron BrowserHost in standalone bootstrap-only mode and blocks in the foreground. Until a canonical supervisor is implemented, it must be launched from a persistent operator/supervisor context rather than an ephemeral shell.

BrowserHost readiness requires all of:

- current descriptor exists and matches the live process;
- control endpoint responds;
- CDP endpoint responds;
- authenticated session inspection succeeds;
- a disposable `/v1/turn/start` lease can be created;
- the exact leased surface becomes selectable through Playwright/CDP;
- `/v1/turn/end` releases that disposable surface cleanly.

For direct Playwright/CDP diagnostics, use Node or the Electron Node runtime. A direct `chromium.connectOverCDP()` probe was observed to hang under Bun while the same host succeeded under Node; do not interpret that Bun-specific probe as BrowserHost failure.

### 3. Start and prove the Responses daemon

```bash
bun run src/cli.ts service start --home "$HOME/.goose-chatgpt-web-dev"
```

Require `/healthz` to report at least:

- `status=ok`;
- `accepting_turns=true`;
- `active_http_turns=0` before the first proof request;
- `active_browser_turns=0` before the first proof request.

Then exercise the real daemon/provider path so the daemon-spawned browser helper is the client actually being qualified.

## Proof requirements after a cold start

A cold start is not accepted merely because every process is alive. Prove:

1. one ordinary real ChatGPT-Web turn through the Responses daemon;
2. one dependent continuation through ordinary Goose/native turn metadata;
3. during active Electron reliability work, one unattended turn that crosses any previously observed response-watch failure boundary.

Do not use a hand-written client with an incomplete continuation contract as evidence that Goose continuation is broken.

## Target supervision design

Manual commands are a development qualification mechanism, not the desired final product behavior.

The final system needs one canonical BrowserHost service/supervisor used by both automatic startup and manual recovery. The desired post-login contract is:

```text
macOS login / canonical supervisor
  → tunnel reaches ready
  → BrowserHost reaches real surface readiness
  → daemon reaches ready
```

A first ChatGPT-Web request should also fail closed or invoke that same canonical recovery mechanism when BrowserHost is unavailable; it must not invent a second startup path.

Do not implement a separate Goose-owned supervisor. Goose remains the consumer of this provider, not the owner of its browser infrastructure.
