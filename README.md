# goose-chatgpt-web

Use an authenticated ChatGPT Web session as a model/provider inside ordinary Goose while Goose remains the owner of the agent session, tools, approvals, delegation, recipes/extensions, project execution, and context lifecycle.

This repository is an adaptation of an earlier browser bridge. Current development is Goose-first: inherited names and lifecycle assumptions are being retired rather than treated as interchangeable with the standalone Goose runtime.

## Current architecture

```text
Goose
  │ custom OpenAI-compatible Responses provider
  ▼
standalone Responses daemon (loopback)
  │
  ▼
Electron BrowserHost
  │ exact task-bound surface over CDP
  ▼
authenticated ChatGPT Temporary Chat

Full mode tool path:
ChatGPT
  → Goose Native connector
  → Secure MCP Tunnel
  → daemon capability broker
  → active Goose tool registry
  → Goose executes/approves the tool
  → result returns to the same browser turn
```

### Ownership is deliberate

| Component | Owns |
| --- | --- |
| Goose | logical conversation/session state, tools and approvals, delegation/subagents, recipes/extensions, project execution, compaction/context lifecycle |
| Responses daemon | local Responses translation, turn/session replay metadata, capability broker, browser-helper lifecycle |
| Electron BrowserHost | authenticated ChatGPT partition, browser surfaces, control endpoint, CDP endpoint |
| Secure MCP Tunnel | outbound connector transport/tool runtime |
| ChatGPT Web | model inference for the selected Goose provider turn |

Electron does **not** own Goose, the Responses daemon, or the tunnel. The daemon and tunnel must remain independently supervised in standalone Goose mode.

## Browser model

Each logical Goose turn receives the complete context Goose chooses to send and is executed in a fresh ChatGPT Temporary Chat. Browser chat history is not the source of truth; Goose is.

The Electron BrowserHost owns a persistent authenticated partition and task-bound `WebContentsView` surfaces. The browser helper attaches to the exact leased surface through the BrowserHost CDP endpoint. This avoids relying on a reusable ordinary Chrome window as the primary runtime.

Managed Chrome remains useful fallback/reference code and is documented as historical architecture, not as the target operating model.

## Current development status

The Electron BrowserHost path has passed real Goose end-to-end turns and dependent continuations, including helper/watchdog recovery work. A complete manual cold shutdown and reconstruction has also been proven:

```text
shutdown: daemon → BrowserHost → tunnel
startup:  tunnel ready → BrowserHost genuinely ready → daemon ready
```

The remaining Electron qualification work is to finish unattended response-watch reliability and encode the proven lifecycle into one deterministic BrowserHost supervisor/startup mechanism suitable for reboot/login and manual recovery.

Until that work is checkpointed, treat [`docs/runtime-lifecycle.md`](docs/runtime-lifecycle.md) as a draft operational contract tied to the active Electron reliability branch/worktree, not as a reason to improvise restarts from generic launcher scripts.

After Electron reliability and deterministic startup are complete, normal development should return to ChatGPT-Web as the high-volume Goose main model and resume the deferred Goose Control work.

## Documentation

Start with [`docs/README.md`](docs/README.md). It separates current runtime documentation, active roadmap items, deferred proposals, and historical material.

Important documents:

- [`docs/architecture.md`](docs/architecture.md) — current Goose-first component and request flow.
- [`docs/runtime-lifecycle.md`](docs/runtime-lifecycle.md) — standalone runtime ownership/startup/shutdown contract.
- [`docs/security-model.md`](docs/security-model.md) — trust boundaries and capability flow.
- [`docs/naming.md`](docs/naming.md) — terminology and legacy-name retirement plan.
- [`docs/roadmap.md`](docs/roadmap.md) — current/next milestones only.
- [`AGENTS.md`](AGENTS.md) — mandatory rules for coding agents.

## Naming

**Goose is the outer harness.** The word `Codex` should be used only when referring to the actual Codex agent/ACP specialist deliberately invoked as an external development worker.

The source tree still contains inherited identifiers such as the project/package name, environment variables, service labels, action names, and `scripts/start-goose-launcher.ts`. Those are migration debt, not architecture. In particular, `start-goose-launcher.ts` does not launch Goose: it currently starts the standalone Electron BrowserHost in bootstrap-only mode and blocks in the foreground.

The exact rename plan is in [`docs/naming.md`](docs/naming.md). Do not create new legacy-named symbols.

## Modes

### Browser-only

Routes selected Goose model turns through ChatGPT Web without exposing Goose tools through the custom connector.

### Full

Adds the `Goose Native` connector path through the Secure MCP Tunnel so ChatGPT can request tools from the active Goose turn. Goose remains the executor and approval authority.

## Safety and security

This is browser automation over a user-authenticated ChatGPT session, not a supported model API and not a usage-limit bypass. ChatGPT UI changes may break automation and should fail explicitly rather than silently choosing another model or transport.

Browser session state and tunnel credentials are sensitive. Keep the runtime on a trusted local account, never commit authentication state, and keep Goose's own sandbox/approval policy appropriate for the tools exposed to a model response.

See [`SECURITY.md`](SECURITY.md) and [`docs/security-model.md`](docs/security-model.md).

## Development

The project currently uses Bun for the TypeScript/runtime toolchain and an Electron/Node browser helper. Run the repository verification suite before merging runtime changes:

```bash
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd launcher
bun run verify
```

For direct Playwright `connectOverCDP()` diagnostics against the Electron BrowserHost, use Node or the Electron Node runtime rather than a Bun-based ad-hoc client; a Bun-specific Playwright connection stall has been observed and can falsely look like BrowserHost failure.

## Repository history

The pre-cleanup documentation and retired architectures remain available in Git history. [`docs/history/README.md`](docs/history/README.md) explains what is historical and why it is no longer authoritative.
