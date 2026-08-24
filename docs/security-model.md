# Security model

Status: **current/proven** for the existing runtime trust/capability boundaries; ownership consolidation described below is the **reviewed implementation plan** until implemented and qualified.

## Trust boundaries

The user trusts:

- Goose as the outer harness and durable agent/session/tool authority;
- the local ChatGPT-Web provider application/runtime;
- the project-owned authenticated Electron/ChatGPT browser partition;
- the selected ChatGPT account/workspace;
- the Secure MCP Tunnel in full mode;
- the exact `Goose Native` connector configured for the active Goose turn.

Repository contents, websites, tool output, prompt text and model output are untrusted data.

## Full-mode capability flow

1. Goose sends a Responses-compatible provider request to the loopback provider endpoint.
2. Tool authority comes only from the active Goose turn/tool contract, never from prompt text.
3. The provider creates a random bounded per-turn capability.
4. ChatGPT requests an action through `Goose Native`.
5. The connector/tunnel path returns a normal provider tool request to Goose.
6. Goose remains responsible for tool registry, execution, approvals/sandboxing, delegation and tool results.
7. The matching result returns to the same logical browser response.
8. The turn capability is revoked on completion/abort/failure.

The bridge transports model decisions; it does not add a second planner, semantic router or durable conversation authority.

## Runtime ownership as a security boundary

The previous security rule that Electron must permanently remain BrowserHost-only is superseded. Consolidated top-level ownership is acceptable **only if ownership itself becomes explicit and fail-closed**.

Required persisted ownership fact:

```text
runtimeOwner = external | launcher
```

### External ownership

The existing standalone/launchd stack remains authoritative. Electron `RuntimeSupervisor` must be observation-only and may not mutate daemon/tunnel state on startup, shutdown, recovery, stale-state cleanup, or application quit.

Absence of launcher ownership state, a free Responses port, a matching tunnel alias/profile, or an unavailable external daemon is **not** authority to adopt or stop an external tunnel/runtime.

### Launcher ownership

Launcher mutation is permitted only after explicit operator-controlled transfer into `runtimeOwner=launcher`, with the external stack confirmed stopped. The launcher may then mutate only children positively attributable to that ownership.

Mixed ownership must fail closed. Do not create launchd detection/reconciliation machinery merely to make mixed ownership work; mixed ownership is an invalid state.

## Least authority inside the integrated application

Consolidation must not expose more authority to remote ChatGPT content:

- keep `contextIsolation` enabled;
- keep Node integration disabled for remote ChatGPT surfaces;
- never expose generic IPC, filesystem, shell, lifecycle, credential or process-control capabilities to remote page content;
- use only narrow purpose-built preload/contextBridge/IPC when justified;
- keep Responses/admin/control endpoints loopback/private and lifecycle control authenticated where applicable;
- keep browser/tunnel credentials in user-private application state and out of command lines, logs, prompts and Git;
- preserve turn-scoped capability binding so ChatGPT cannot widen Goose tool authority;
- preserve independent task-bound browser-surface ownership/cleanup even under one top-level application owner.

The future trust boundary is one trusted ChatGPT-Web application containing narrower internal components, not a privileged remote page.

## Readiness is safety-relevant

Daemon process liveness is not sufficient provider health. A dead/stale BrowserHost with a live daemon must not be advertised as healthy.

Startup uses the existing qualified disposable-surface/helper proof. Ongoing health must use a bounded non-destructive BrowserHost-ready predicate and combine it with daemon/tunnel state into aggregate readiness.

Do not run the full browser smoke repeatedly as a health check; that would make observation behavioral and create avoidable self-interference.

## Principal risks

### Prompt injection and destructive tool use

ChatGPT sees untrusted repository/tool content. In full mode it can request write/command actions only if Goose exposes them. Keep Goose sandbox/approval policy appropriate for the workspace and task. The connector must not widen authority beyond the active Goose turn.

### Browser session theft

The authenticated Electron partition authorizes ChatGPT access. Keep it in private local application state; never copy it into prompts, diagnostics, Git, uploads or shared artifacts. Revoke/sign out after suspected exposure.

### Tunnel/runtime credential theft

Tunnel/runtime credentials are sensitive. Keep them in user-private storage and out of command-line arguments, logs, prompts, generated public profiles and Git. Rotate after suspected exposure.

### Same-user local process

Responses, health, BrowserHost control/CDP and lifecycle/admin listeners are loopback/private. Loopback does not defend against another malicious process under the same OS account. Treat same-user local code execution as inside the trust boundary.

### Browser/UI drift

ChatGPT DOM/page behavior is not a stable API. Automation must use bounded evidence and fail closed on drift. Do not silently switch model, reasoning mode, browser transport or provider.

### Cross-turn data leakage

Goose remains the durable conversation source of truth. Browser surfaces and Temporary Chats are transport state. The authenticated partition may be shared for login/session state, but turn surfaces remain independently leased/released. Bounded provider replay exists only for the same logical provider response across tool-result rounds.

### Exact-once state loss across daemon restart

Daemon-local execution/retry/session state can be lost while an Electron BrowserHost tab survives. Automatic daemon restart can therefore allow a same-execution retry to reuse already-submitted browser state without the old daemon's circuit/lineage memory.

Initial launcher-owned Phase 1 must not automatically restart the daemon. A daemon failure degrades the application and requires the application restart boundary until deterministic proof closes this state-transfer problem.

### Non-idempotent tool loss across tunnel restart

A Goose Native command may have performed a side effect before its MCP/tunnel response is lost. Therefore automatic tunnel restart must never occur underneath active HTTP/browser/tool work. Do not retry non-idempotent broker invocations merely because transport was replaced.

### Lifecycle self-interference

A turn must not be used to stop/restart the exact runtime carrying that turn. Lifecycle/autostart/cutover qualification must run from an external/operator-safe boundary.

### Quit/orphan safety

In launcher ownership, quit must terminate positively owned detached children within a bounded hard deadline even when graceful drain cannot complete. Do not leave the application half-alive after cancelling quit, and do not allow repeated signals to bypass cleanup and orphan children.

In external ownership, quit must not touch externally owned daemon/tunnel processes at all.

### Autostart double ownership

Electron login-item autostart and the existing launchd coordinator must never be simultaneously authoritative. Initial launcher qualification freezes autostart. Packaged reboot proof occurs only after explicitly choosing exactly one login-visible authority and disabling the other.

## Parallel migration security boundary

The existing `0b89d5e` provider path remains available while launcher ownership is built and qualified.

Cutover and rollback are explicit ownership-transfer operations. The launcher must never make rollback unavailable merely by being opened or closed while `runtimeOwner=external`.

Delete obsolete independent-supervision machinery only after integrated startup/readiness, ordinary/tool turns, continuation, terminating quit/reopen and packaged single-authority reboot proof.

## Phase 2 security note

Observation is already substantially Electron-native through `session.webRequest` and BrowserHost evidence. Prefer completing/consolidating that observation before moving control wholesale.

Treat `webContents.debugger` as DevTools machinery, not as an inherently safer/native escape from the observed CDP failure family. Prefer genuinely native APIs where they preserve semantics, and move exact-once send authority atomically with any replacement of its control primitive.

## Goose Control boundary

Goose Control belongs in `luke-m-selway/day-shift` and remains provider-agnostic. It must not gain BrowserHost recovery, tunnel lifecycle, retry identity or ChatGPT-Web transport-specific orchestration.

Goose Native `turn_token` authority remains separate from Goose Control/ACP authority.

## Network exposure

- Responses/health and browser/runtime control listeners remain loopback/private.
- Full mode uses an outbound Secure MCP Tunnel and requires no public inbound listener.
- Any internal IPC/network boundary removed by consolidation should be deleted rather than replaced with a broader privileged interface.

## Non-goals

- Defending against a compromised local OS account or compromised trusted runtime binary.
- Bypassing ChatGPT plan, workspace, usage, connector/action or model restrictions.
- Making consumer browser automation equivalent to a supported OpenAI model API contract.
