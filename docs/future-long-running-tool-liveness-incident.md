# Future investigation — long-running Goose Native tool and Electron control-liveness failure

Status: **live evidence / deferred reliability investigation; documentation only.**

Captured from a ChatGPT-Web Electron session on **2026-08-12 at approximately 23:55 Europe/Berlin**. This incident is deliberately recorded separately from the same-session continuation defect because it reached the same terminal Electron error without the evidence being limited to a second-user-turn path.

Related work:

- PR #29 — cross-transport Goose continuation failure and retry churn;
- PR #27 — deferred state-driven Electron turn observability hardening.

## Observed sequence

The ChatGPT-Web turn had already executed normal Goose Native shell work, including a bounded inspection command. The final visible tool invocation then started a disposable loopback `goose serve` proof with a command equivalent to:

```bash
ROOT="$(mktemp -d /tmp/goose-control-fresh-proof.XXXXXX)"
# create disposable cwd, port and secret under the temp root
exec env GOOSE_SERVER__SECRET_KEY="<redacted>" \
  goose serve --host 127.0.0.1 --port "$PORT"
```

The important semantic property is that the command ends in foreground `exec ... goose serve`: once healthy, `goose serve` is expected to remain running rather than exit naturally.

After the turn had reached this long-running tool action, Goose surfaced:

```text
Request failed: Responses API failed: Object {
  "message": String("ChatGPT browser/CDP control path became unresponsive after the message was sent."),
  "type": String("server_error"),
  "code": String("chatgpt_browser_control_unresponsive")
}.
```

Do not infer from this alone that `goose serve` caused the browser/CDP failure. A healthy Electron renderer should remain controllable while ChatGPT waits on a long-running MCP/tool invocation.

## Why this matters

This is a second live route to the same Electron terminal error previously observed during failed same-session continuation:

```text
chatgpt_browser_control_unresponsive
```

The continuation reproduction remains independently important because the same user-facing inability to follow up existed under managed Chrome, before the current Electron liveness watcher. Therefore this new incident **does not collapse the continuation bug into an Electron-only issue**.

It does, however, materially strengthen the case that the Electron post-send control-liveness mechanism is an independent reliability surface that can fail during a sustained active turn.

A useful two-layer model for future diagnosis is:

```text
Layer A — shared continuation/session defect
  same Goose chat advances to a later user turn
  → stale/superseded state, authority, identity or replay can become unhealthy

Layer B — Electron control-liveness defect or false positive
  any sustained sent ChatGPT turn
  → transient control/CDP stall or weak probe evidence
  → chatgpt_browser_control_unresponsive
```

Layer B may amplify Layer A during continuation, but Layer A is still needed to explain managed-Chrome history.

## Current code evidence

On the baseline used when this incident was recorded, post-send liveness is defined by `src/adapters/chatgpt-web/control-liveness.ts`:

- probe every 5 seconds;
- each probe is bounded to 3 seconds;
- two consecutive failures are terminal;
- the probe is `page.evaluate(() => document.readyState)`;
- terminal error is retryable 502 `chatgpt_browser_control_unresponsive`.

The watcher intentionally has no overall generation deadline: a responsive browser may generate forever. `runBrowserTurn()` races the entire response/tool loop against this watcher.

Therefore a long-running tool call is allowed in principle, but the browser turn still dies if two consecutive `document.readyState` probes fail while it is waiting.

## Goose Native long-running-command contract to qualify

`src/adapters/chatgpt-web/mcp-server.ts` advertises `codex_exec` as:

> Run a native outer-harness command. A long-running command returns its native `session_id`.

That behavior depends on which exact command capability the outer Goose turn advertises.

When Goose exposes a rich `exec_command`-style tool, the bridge can pass fields such as `yield_time_ms`, `max_output_tokens` and `tty`, and a long-running process can return a session handle for later polling through `codex_write_stdin`.

When the outer environment exposes only the plain Goose `shell` command capability, the current fallback invokes it only as:

```text
{ command: <cmd> }
```

The bridge cannot impose `yield_time_ms`, TTY/session semantics or a bounded handoff on that route. A foreground service command can therefore remain pending indefinitely if Goose's `shell` implementation itself waits for process exit.

The turn broker also intentionally permits an unbounded invocation when the turn environment has no expiry: the MCP call waits until the tool finishes, the turn is revoked, or the connection is otherwise broken.

This creates a contract question that must be resolved rather than hidden:

> **Does `codex_exec` truthfully support session-style long-running commands under the actual Goose 1.45 command tool schema used by standalone Goose?**

If not, the bridge should distinguish capabilities honestly rather than advertise identical long-running semantics for every fallback route.

## Leading hypotheses — keep separate

Do not merge these into one assumed cause without correlated logs.

1. **Real Electron/CDP control stall during a sustained active tool turn.** The renderer or exact-surface control path genuinely stopped answering for multiple probes.
2. **Liveness false positive / weak evidence.** Two timed-out `page.evaluate(document.readyState)` calls are insufficient to declare a visibly active task-bound renderer terminal.
3. **Long-running plain `shell` invocation exposes the weakness.** The foreground service does not directly break CDP, but holds the ChatGPT response open long enough for transient control problems to become terminal.
4. **Goose Native long-running-command contract mismatch.** `codex_exec` promises a session-style result that the active plain `shell` route may not be able to provide.
5. **Another BrowserHost/helper failure unrelated to the tool duration.** The temporal proximity to `goose serve` may be incidental.

## Required next evidence

On the next controlled reproduction, correlate one trace across:

- ChatGPT browser turn `traceId` and Electron `surfaceId`;
- exact time the long-running Goose Native invocation was queued and delivered;
- whether Goose returned a tool result or remained pending;
- whether a `session_id` was ever produced;
- broker pending invocation count;
- post-send liveness probe successes/failures and timestamps;
- BrowserHost `WebContents` health and renderer crash/unresponsive signals;
- helper/control endpoint responsiveness;
- visible ChatGPT semantic state while the probe failed;
- any relevant browser-network activity if PR #27 later provides a qualified shared observer.

Record the elapsed time from starting the foreground service to the terminal liveness error.

## Controlled proof to add later

Use a harmless disposable long-running process whose lifecycle is fully owned by the test.

Compare:

```text
A. short command that exits normally
B. long command through the actual Goose command tool
C. long command that returns a real session_id, if supported
D. poll/stop that session through codex_write_stdin
```

Require for B/C/D:

- the ChatGPT browser remains responsive for substantially longer than the current 5s/3s/2-probe window;
- no `chatgpt_browser_control_unresponsive` while BrowserHost/renderer evidence says the surface is healthy;
- no indefinite orphan process after cancellation;
- the public `codex_exec` contract matches the actual capability provided by Goose.

## Relationship to PR #29

PR #29 should continue to own the **cross-transport same-session continuation** diagnosis. This incident should prevent a future agent from assuming that every Electron `chatgpt_browser_control_unresponsive` is itself proof of a continuation-root-cause failure.

When diagnosing a continuation reproduction that ends in the same error, distinguish:

```text
why did the later Goose user turn become unhealthy?
```

from:

```text
why did Electron declare the already-sent active browser turn uncontrollable?
```

Both may need fixes.

## Relationship to PR #27

PR #27 is the natural home for eventual Electron liveness/observability changes. This incident upgrades the deferred watcher work from a purely defensive design improvement to a feature with **independent live failure evidence**.

Do not react by merely increasing timeouts. A correct fix should improve the quality of liveness evidence and preserve genuinely healthy long-running turns while still failing promptly on real renderer/control loss.

## Stop boundary

Documentation only. Do not modify or restart the active ChatGPT-Web transport from the same ChatGPT-Web-backed session that depends on it. Implementation should be performed by an independent provider/session when scheduled.