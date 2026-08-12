# Security model

## Trust boundaries

The user trusts:

- Goose as the outer harness;
- this local Responses daemon;
- the project-owned Electron BrowserHost and its private ChatGPT session partition;
- the selected ChatGPT workspace/account;
- OpenAI's Secure MCP Tunnel service in full mode;
- the exact `Goose Native` connector the user configured.

Repository contents, tool output, websites, prompt text, and model output are untrusted data.

## Full-mode capability flow

1. Goose sends a Responses-compatible provider request to the loopback daemon.
2. The daemon derives tool authority only from the active Goose request/turn contract. User-authored prompt text is never accepted as sandbox, cwd, workspace, approval, or tool authority.
3. The daemon creates a random bounded turn capability for that browser response.
4. ChatGPT can request an action only through the current `Goose Native` connector contract.
5. The MCP handler validates/claims the current turn binding and emits a normal provider tool call back to Goose.
6. Goose remains responsible for the tool registry, sandbox/approval policy, command execution, delegation, and tool result.
7. The matching tool result is returned through the same logical browser-turn session.
8. The capability is revoked when the browser turn completes, aborts, fails, or is explicitly cancelled.

The bridge transports model decisions; it does not add a second planner, semantic router, or fallback model.

## Principal risks

### Prompt injection and destructive tool use

ChatGPT sees repository content and tool results that may contain hostile instructions. Full mode can request write/command actions if Goose advertises them. Keep Goose's own sandbox and approval settings appropriate for the workspace and task.

The connector must never grant broader authority than the active Goose turn actually exposes.

### Browser session theft

The Electron BrowserHost persistent partition can authorize ChatGPT access. It belongs in the current OS user's private application-data area and must never be copied into prompts, committed, uploaded, synced into a repository, or exposed in diagnostics.

On suspected exposure, revoke/sign out the ChatGPT session and recreate the browser state.

### Tunnel credential theft

Tunnel/runtime credentials are sensitive even though they are not model API billing credentials. Store them in user-private files or the platform's intended credential mechanism, never in command-line arguments, generated public profiles, logs, prompts, or Git.

Rotate them after suspected exposure.

### Same-user local process

Responses, BrowserHost control, and CDP endpoints are loopback-only. Loopback does not defend against another malicious process running as the same OS user.

Treat local code execution under the same user as inside the trust boundary. Lifecycle control endpoints should still use scoped random bearer tokens to prevent accidental/unauthenticated control through ordinary local HTTP requests.

### Browser/UI drift

ChatGPT DOM, labels, and page lifecycle are not stable APIs. Automation must use bounded evidence and fail closed on drift. A selector failure or hidden-surface lifecycle problem must not silently choose another model, reasoning mode, transport, provider, or fabricated success.

### Cross-turn data leakage

Goose is the durable conversation source of truth. Browser turns use task-bound surfaces and fresh ChatGPT Temporary Chats rather than relying on a shared persistent chat history.

The authenticated browser partition is shared only for login/session state. Turn documents/surfaces must remain independently leased and released. Bounded replay metadata in the daemon exists only to resume the same logical response across Goose provider/tool-result rounds; it must expire and must not become a second durable conversation store.

### Incorrect lifecycle ownership

Standalone Goose intentionally separates:

- Responses daemon;
- Electron BrowserHost;
- Secure MCP Tunnel.

Electron must not adopt or stop daemon/tunnel ownership. A lifecycle operation must target the exact project-owned component and prove idleness/readiness at the appropriate boundary.

A stale descriptor, live PID, or listening CDP port is not sufficient evidence of a usable BrowserHost; real surface creation/selection is the stronger readiness contract.

### Ambiguous legacy naming

Inherited names can cause an operator or agent to invoke the wrong lifecycle path. Current documentation therefore uses Goose-first component names and treats legacy package/service/script names as migration debt. See [`naming.md`](naming.md).

## Network exposure

- Responses and health listeners bind to loopback only.
- BrowserHost control/CDP endpoints bind to loopback only.
- Full mode uses the outbound Secure MCP Tunnel; it does not require an inbound public listener or router port-forward.
- The embedded browser connects to ChatGPT and user-authorized URLs through normal browser networking.

## Model/provider behavior

- Model selection is explicit.
- Unsupported modes/capabilities fail explicitly.
- The bridge must not retry aggressively or switch transports/providers to evade usage/rate limits.
- ChatGPT connector-side safety/permission decisions remain external constraints and are not bypassed by this project.

## Non-goals

- Defending against a compromised local OS account.
- Defending against a compromised Goose/Electron binary running as the user.
- Bypassing ChatGPT plan, workspace, usage, connector-permission, or model restrictions.
- Making consumer browser automation equivalent to a supported OpenAI model API contract.
