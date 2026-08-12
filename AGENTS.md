# Agent safety and runtime rules

These instructions apply to coding/automation agents working in this repository.

## Read current documentation first

Before architecture, startup/restart, browser-host, provider, or tunnel work, read:

1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/runtime-lifecycle.md`
4. `docs/naming.md`

Current documentation outranks historical material and deferred proposals. Do not infer ownership from a filename such as `launcher`.

## Host/session safety

- Preserve ignored `.env` files, browser authentication state, runtime keys, credentials, and unrelated local proof artifacts unless the task explicitly authorizes changing them.
- Never print, log, commit, or otherwise expose credentials or authentication material.
- Do not enumerate macOS Keychain contents or use broad discovery commands such as `security dump-keychain`.
- If a task genuinely requires a Keychain item, access only the exact known service/account entry needed for that task.
- A Goose main agent must never restart, quit, upgrade, relaunch, terminate, or otherwise replace the Goose host carrying its own session.
- If host-Goose lifecycle work is genuinely required, stop and ask for an external operator.

## Standalone runtime ownership

- Goose owns logical session state, tools/approvals, delegation, recipes/extensions, project execution, and context lifecycle.
- The Responses daemon owns the provider endpoint, bounded replay state, capability broker, and daemon-spawned browser helper.
- Electron BrowserHost owns only the authenticated browser partition, task-bound browser surfaces, control endpoint, and CDP endpoint.
- The Secure MCP Tunnel is independently supervised.
- Electron must not adopt, restart, or stop the standalone daemon or tunnel.

The qualified dependency order is:

```text
start: tunnel ready → BrowserHost genuinely ready → Responses daemon ready
stop:  Responses daemon → BrowserHost → tunnel
```

Do not treat PID/descriptor/CDP existence alone as BrowserHost readiness; prove a disposable leased surface can materialize and be selected when the task requires a cold-start proof.

## Legacy launcher naming

`scripts/start-goose-launcher.ts` is a legacy filename. It does **not** launch Goose. It starts the standalone Electron BrowserHost in bootstrap-only mode and blocks in the foreground. Until the naming/supervision migration lands, do not launch it from an ephemeral shell and do not substitute generic `app`, `launcher`, or development scripts for the documented standalone BrowserHost path.

Do not create new names containing `codex` unless referring to the actual Codex agent/ACP specialist. See `docs/naming.md`.

## Browser diagnostics

- Do not use broad process-kill commands for Chrome, Electron, Playwright, the daemon, or the tunnel. Target only a known project-owned process when an explicit test requires it.
- Direct Playwright `chromium.connectOverCDP()` diagnostics for the Electron BrowserHost must use Node or the Electron Node runtime. A Bun-based direct Playwright client has produced a false 60-second `browser_page` failure while the same BrowserHost was healthy under Node.
- Do not increase stage timeouts to hide an unknown lifecycle defect.
- Preserve fail-closed behavior on ChatGPT UI drift.

## Delegation

- Until Electron/browser-host concurrency is explicitly qualified, ChatGPT-Web child agents must be spawned deliberately and parallel ChatGPT-Web child fan-out is forbidden unless the current milestone explicitly proves it safe.
- When delegating to a non-ChatGPT/free worker, name the intended provider/model explicitly so it does not inherit the ChatGPT-Web transport by accident.
- Use the actual Codex agent only as an explicit specialist/delegated worker; its name must not be used as a synonym for Goose or this project's runtime.
