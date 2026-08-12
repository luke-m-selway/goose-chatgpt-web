# Standalone Goose runtime lifecycle

Status: **provisional operational contract under final Electron qualification.** A complete manual cold shutdown/reconstruction sequence was proven on macOS on 2026-08-12, but the final supervisor/trigger, reboot behavior, and remaining long-turn proof are not yet qualified. This documentation PR must remain draft until those details are filled from live evidence against the merged Electron revision.

This is the authoritative **current operator sequence** for the standalone Goose development deployment. It is not yet the final product startup implementation. Do not reconstruct ownership from generic launcher scripts or inherited desktop-app behavior.

## What is proven and what is still provisional

### Proven on the 2026-08-12 macOS development runtime

- all project-owned ChatGPT-Web infrastructure can be stopped cleanly and reconstructed from zero;
- the safe observed shutdown order was Responses daemon → Electron BrowserHost → Secure MCP Tunnel;
- the successful observed startup order was Secure MCP Tunnel ready → Electron BrowserHost genuinely ready → Responses daemon ready;
- the fresh BrowserHost could create a disposable leased surface and Node/Playwright could select that exact surface over CDP;
- the freshly started daemon loaded the rebuilt browser-helper bundle path and completed one real Responses-daemon ChatGPT-Web turn successfully;
- direct Playwright `connectOverCDP()` under Bun can hang even when the same BrowserHost is healthy under Node, so Bun-based ad-hoc Playwright probes are not valid BrowserHost readiness evidence.

### Not yet proven / intentionally left open

These are **known qualification gaps, not facts to infer from the current command names**:

- the final automatic startup trigger: macOS login/autostart, first ChatGPT-Web use, or a combination in which both invoke the same canonical supervisor;
- the exact canonical BrowserHost service/CLI interface and its persistent supervision mechanism;
- a real machine reboot/login → automatic reconstruction → ordinary Goose first turn → dependent continuation proof;
- whether the observed tunnel-first ordering is a strict technical dependency or simply the currently proven safe canonical order. Until tested otherwise, keep the proven order;
- an ordinary-Goose dependent continuation after the latest full cold reconstruction. A raw HTTP follow-up using only `previous_response_id` was rejected because it omitted native turn metadata and is **not** evidence of a Goose continuation regression;
- the unattended response-watch proof for the current Electron lifecycle-reassertion work;
- source-to-built-helper hash equivalence in the latest cold proof. The live process path was confirmed; exact source/bundle identity was not independently hashed;
- cross-platform qualification of this standalone Goose lifecycle. The cold reconstruction described here was performed on macOS; inherited upstream Windows/Linux launcher behavior must not be assumed equivalent.

When any item above is resolved by the active Electron work, update this document with the exact command/trigger/readiness evidence and remove the corresponding provisional marker. Do not leave a now-known detail described as a guess.

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

This is the **proven safe canonical sequence**, not proof that every alternative ordering is impossible. Keep this order until an explicit lifecycle test establishes and documents a different contract.

The dependency is about readiness, not merely process order. A PID, descriptor, or listening CDP socket alone does not prove that BrowserHost can serve a turn.

## Development runtime home

The currently qualified development installation uses:

```text
~/.goose-chatgpt-web-dev
```

Pass it explicitly with `--home` when operating the daemon/tunnel from the repository. Do not assume another user's runtime home.

This path is a development deployment detail, not the final renamed/default runtime-home contract. See [`naming.md`](naming.md).

## Controlled shutdown

### 1. Drain and stop the Responses daemon

```bash
bun run src/cli.ts service stop --home "$HOME/.goose-chatgpt-web-dev"
```

Require the service to unload and the Responses listener to disappear before continuing.

### 2. Stop the Electron BrowserHost

The current source entry point is the legacy-named `scripts/start-goose-launcher.ts`. Its actual role is **BrowserHost only** in bootstrap-only mode. It is foreground-blocking and therefore requires a persistent supervisor.

Terminate the known BrowserHost process with `SIGTERM`; the qualified bootstrap-only shutdown path must release browser state/control cleanly and remove the matching descriptor. Do not use broad process-kill commands.

The legacy filename is scheduled to become an explicit BrowserHost name; the exact final command/service surface is still a migration decision. See [`naming.md`](naming.md).

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

Current source command used in the successful manual proof:

```bash
bun run scripts/start-goose-launcher.ts
```

Despite the filename, this does not start Goose. It starts the Electron BrowserHost in standalone bootstrap-only mode and blocks in the foreground. Until a canonical supervisor is implemented, it must be launched from a persistent operator/supervisor context rather than an ephemeral shell.

**Provisional detail:** this is the current source-level development command, not the final post-reboot/service interface. The final supervisor must make its runtime home, bootstrap-only mode, executable/build identity, and lifetime ownership explicit so an operator or agent cannot accidentally start the same source with different effective environment.

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

As of the 2026-08-12 cold reconstruction, item 1 passed; items 2 and 3 remained to be completed on the reconstructed runtime.

Do not use a hand-written client with an incomplete continuation contract as evidence that Goose continuation is broken.

## Target supervision design

Manual commands are a development qualification mechanism, not the desired final product behavior.

The final system needs one canonical BrowserHost service/supervisor used by both automatic startup and manual recovery. Two product-trigger choices remain open until the active reliability work evaluates them:

- **eager:** start/reconstruct at macOS login;
- **lazy/self-healing:** start or recover on the first ChatGPT-Web request;
- **hybrid:** login startup as the normal path plus first-use recovery through the **same** supervisor.

Whichever is selected, there must be only one construction path. A first ChatGPT-Web request must never improvise a second launcher sequence.

The target readiness sequence remains:

```text
canonical supervisor
  → tunnel reaches ready
  → BrowserHost reaches real surface readiness
  → daemon reaches ready
```

Do not implement a separate Goose-owned supervisor. Goose remains the consumer of this provider, not the owner of its browser infrastructure.

## Revalidation checklist after the Electron reliability branch lands

Before this document can move from provisional to current/stable:

- replace temporary/legacy BrowserHost command names with the actual canonical interface;
- record the exact non-secret environment/runtime-home inputs that the supervisor fixes;
- record whether startup is login-triggered, first-use-triggered, or hybrid;
- prove a clean supervisor stop/start and a reboot-equivalent reconstruction;
- prove ordinary Goose first turn + dependent continuation from that reconstructed state;
- finish the unattended response-watch proof;
- update any readiness checks that move from manual probes into a formal health endpoint/CLI command;
- revalidate the commands after the runtime naming migration so no old identifier remains an undocumented dependency.
