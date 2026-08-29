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

## Lifecycle health, provider admission and application readiness

These are deliberately separate security/control concepts.

### Lifecycle health

Daemon `/healthz` and supervisor `proxyHealth` remain process/runtime identity evidence. They must not depend on BrowserHost state because the lifecycle code uses them to distinguish external ownership, stale ownership and process identity. A BrowserHost failure must not make a live external daemon look unowned.

### Provider admission

Add a distinct supervisor-owned `turns_enabled` gate, default false, controlled only through authenticated `/admin/enable|disable` on the existing control-token path.

- `/v1/responses` and `/v1/responses/compact` require `!draining && turns_enabled`;
- `/v1/models` remains available while turn admission is disabled;
- existing `accepting_turns` remains drain/resume state and is not overloaded.

This allows the daemon/broker to exist for startup diagnostics while preventing any browser-backed model turn before the supervisor has completed the BrowserHost proof and required tunnel startup.

### Application READY

Electron/`RuntimeSupervisor` owns aggregate READY. The daemon does not poll Electron for BrowserHost health.

A launcher startup/recovery epoch may enable turns only after:

1. daemon identity/broker exists;
2. qualified BrowserHost startup proof passes;
3. required tunnel is ready.

Each actual browser turn retains point-of-use BrowserHost validation, avoiding stale daemon-cached browser readiness.

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

Daemon-local execution/retry/session state can be lost while Electron BrowserHost state survives. Initial launcher qualification must therefore not automatically restore turn admission after daemon restart.

If daemon recovery is later enabled, it starts with `turns_enabled=false`, reruns the qualified BrowserHost proof and required tunnel readiness, then enables. Do not allow a restarted daemon to silently resume browser turns from process health alone.

### Non-idempotent tool loss across tunnel restart

A Goose Native command may have performed a side effect before its MCP/tunnel response is lost. Therefore tunnel recovery must never occur underneath active HTTP/browser/tool work.

Any later tunnel recovery sequence is disable admission → bounded drain/idle proof → owned tunnel restart → tunnel ready → enable admission. Do not retry non-idempotent broker invocations merely because transport was replaced.

### Lifecycle self-interference

A turn must not be used to stop/restart the exact runtime carrying that turn. Lifecycle/autostart/cutover qualification must run from an external/operator-safe boundary.

### Quit/orphan safety and cancel-before-retire

Ordinary UI Quit and forced OS/process termination are intentionally different.

- UI Quit with active work refuses cleanly and may offer explicit Cancel-and-Quit through the existing cancellation path.
- OS logout/reboot/SIGTERM cannot refuse indefinitely: disable admission, bounded drain, then cancel outstanding browser turns on expiry before graceful shutdown/hard owned-process cleanup.

The cancellation step preserves the existing cancel-before-retire safety argument as far as possible. It cannot prove that a non-idempotent external side effect did not already land, so do not create a second durable provider conversation store to fake certainty.

In external ownership, application quit must not touch externally owned daemon/tunnel processes at all.

### Autostart double ownership

Electron login-item autostart and the existing launchd coordinator must never be simultaneously authoritative. Initial launcher qualification freezes autostart. Packaged reboot proof occurs only after explicitly choosing exactly one login-visible authority and disabling the other.

## Parallel migration security boundary

The existing `0b89d5e` provider path remains available while launcher ownership is built and qualified.

Cutover and rollback are explicit ownership-transfer operations. The launcher must never make rollback unavailable merely by being opened or closed while `runtimeOwner=external`.

Delete obsolete independent-supervision machinery only after integrated startup/admission/readiness, ordinary/tool turns, continuation, quit/reopen and packaged single-authority reboot proof.

## Phase 2 security note

Observation is already substantially Electron-native through `session.webRequest` and BrowserHost evidence. Prefer completing/consolidating that observation before moving control wholesale.

Treat `webContents.debugger` as DevTools machinery, not as an inherently safer/native escape from the observed CDP failure family. Prefer genuinely native APIs where they preserve semantics, and move exact-once send authority atomically with any replacement of its control primitive.

## Goose Control boundary

Goose Control belongs in `luke-m-selway/day-shift` and remains provider-agnostic. It must not gain BrowserHost recovery, tunnel lifecycle, retry identity or ChatGPT-Web transport-specific orchestration.

Goose Native `turn_token` authority remains separate from Goose Control/ACP authority.

## Network exposure

- Responses/health and browser/runtime control listeners remain loopback/private.
- `/admin/enable|disable` must use the existing authenticated lifecycle control-token boundary; do not expose unauthenticated admission toggles.
- Full mode uses an outbound Secure MCP Tunnel and requires no public inbound listener.
- Any internal IPC/network boundary removed by consolidation should be deleted rather than replaced with a broader privileged interface.

## Non-goals

- Defending against a compromised local OS account or compromised trusted runtime binary.
- Bypassing ChatGPT plan, workspace, usage, connector/action or model restrictions.
- Making consumer browser automation equivalent to a supported OpenAI model API contract.
