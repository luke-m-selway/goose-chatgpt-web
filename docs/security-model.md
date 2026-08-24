# Security model

Status: **current/proven** for the existing runtime trust/capability boundaries; ownership consolidation described below is **active design** until implemented and qualified.

## Trust boundaries

The user trusts:

- Goose as the outer harness and durable agent/session/tool authority;
- the local ChatGPT-Web provider runtime;
- the project-owned authenticated Electron/ChatGPT browser partition;
- the selected ChatGPT account/workspace;
- the Secure MCP Tunnel in full mode;
- the exact `Goose Native` connector configured for the active Goose turn.

Repository contents, websites, tool output, prompt text and model output are untrusted data.

## Full-mode capability flow

1. Goose sends a Responses-compatible provider request to the loopback provider endpoint.
2. Tool authority comes only from the active Goose turn/tool contract, never from user-authored prompt text.
3. The provider creates a random bounded per-turn capability.
4. ChatGPT requests an action through the current `Goose Native` connector.
5. The connector/tunnel path returns a normal provider tool request to Goose.
6. Goose remains responsible for tool registry, execution, approvals/sandboxing, delegation and tool results.
7. The matching result returns to the same logical browser response.
8. The turn capability is revoked on completion/abort/failure.

The bridge transports model decisions; it does not add a second planner, semantic router or durable conversation authority.

## Runtime ownership and security

### Current implementation

The current runtime has separately supervised Responses daemon, Electron BrowserHost and Secure MCP Tunnel. Existing lifecycle and private loopback boundaries remain in force until the replacement path is qualified.

### Active design direction

The earlier rule that security requires Electron to **never** supervise daemon/tunnel is superseded as an architectural constraint.

A self-contained ChatGPT-Web application may become the single top-level owner/supervisor of those internal components without weakening the trust model, provided that consolidation preserves least authority and process separation where useful.

Ownership consolidation must **not** mean exposing more authority to remote ChatGPT content. In particular:

- keep `contextIsolation` enabled;
- keep Node integration disabled for remote ChatGPT surfaces;
- never expose generic IPC, filesystem, shell, lifecycle, credential or process-control capabilities to remote page content;
- use only narrow purpose-built preload/contextBridge/IPC surfaces if needed;
- keep Responses/admin/control endpoints loopback/private and lifecycle control authenticated where applicable;
- keep browser/tunnel credentials in user-private application state and out of command lines, logs, prompts and Git;
- preserve turn-scoped capability binding so ChatGPT cannot widen Goose tool authority;
- preserve independent task-bound browser-surface ownership and cleanup even if one application supervises all children.

The future security boundary is therefore **one trusted ChatGPT-Web application containing narrower internal components**, not one remote page with broad application privileges.

## Principal risks

### Prompt injection and destructive tool use

ChatGPT sees untrusted repository/tool content. In full mode it can request write/command actions only if Goose exposes them. Keep Goose sandbox/approval policy appropriate for the workspace and task. The connector must not widen authority beyond the active Goose turn.

### Browser session theft

The authenticated Electron partition authorizes ChatGPT access. Keep it in private local application state; never copy it into prompts, diagnostics, Git, uploads or shared artifacts. Revoke/sign out after suspected exposure.

### Tunnel/runtime credential theft

Tunnel/runtime credentials are sensitive. Keep them in user-private storage and out of command-line arguments, logs, prompts, generated public profiles and Git. Rotate after suspected exposure.

### Same-user local process

Responses, health, BrowserHost control/CDP and lifecycle/admin listeners are loopback/private. Loopback does not defend against another malicious process running as the same OS user. Treat same-user local code execution as inside the trust boundary.

### Browser/UI drift

ChatGPT DOM/page behavior is not a stable API. Automation must use bounded evidence and fail closed on drift. Do not silently switch model, reasoning mode, browser transport or provider.

Moving some control from external Playwright/CDP into Electron-owned `webContents`, preload/IPC or `webContents.debugger` must not replace mature waiting/selector behavior with unsafe broad script execution or fragile polling.

### Cross-turn data leakage

Goose remains the durable conversation source of truth. Browser surfaces and Temporary Chats are transport state. The authenticated partition may be shared for login/session state, but turn surfaces remain independently leased/released. Bounded provider replay state exists only to resume the same logical provider response across tool-result rounds and must not become a second durable conversation store.

### Lifecycle self-interference

A turn must not be used to stop/restart the exact runtime carrying that turn. Lifecycle/autostart/cutover qualification must run from an external/operator-safe boundary.

### Failure amplification under consolidated ownership

One top-level owner creates a clearer restart boundary but can amplify failures if child crashes trigger indiscriminate whole-app restart loops. The design must define bounded child recovery, fail-closed crash-loop behavior, stale-state cleanup and explicit readiness degradation. The Opus pre-implementation review must attack these paths before implementation.

## Parallel migration security boundary

The existing `0b89d5e` provider path remains available while integrated mode is built and qualified. Do not destructively replace the current path before equivalent security/readiness/tool-continuation guarantees are proven.

Cutover must be bounded and reversible. Retain the old path briefly as rollback, then delete obsolete independent-supervision machinery only after replacement qualification.

## Goose Control boundary

Goose Control belongs in `luke-m-selway/day-shift` and remains provider-agnostic. It must not gain ChatGPT-Web BrowserHost recovery, tunnel lifecycle, retry identity or transport-specific orchestration simply because ChatGPT-Web internal ownership changes.

Goose Native `turn_token` capability authority remains separate from Goose Control/ACP control authority.

## Network exposure

- Responses/health and browser/runtime control listeners remain loopback/private.
- Full mode uses an outbound Secure MCP Tunnel and requires no public inbound listener.
- Any future internal IPC/network boundary removed by consolidation should be deleted rather than replaced with a broader privileged interface.

## Non-goals

- Defending against a compromised local OS account or compromised trusted runtime binary.
- Bypassing ChatGPT plan, workspace, usage, connector/action or model restrictions.
- Making consumer browser automation equivalent to a supported OpenAI model API contract.
