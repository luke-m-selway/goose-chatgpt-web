---
name: chatgpt-web-runtime-recovery
description: Restore a retained or repeatedly re-admitted ChatGPT-Web runtime to clean idle using the supported out-of-band cancellation path.
---

# ChatGPT-Web runtime recovery

Use this skill only from a **fresh out-of-band agent** when an affected ChatGPT-Web lineage is spinning, retained, repeatedly opening replacement surfaces, or otherwise unable to settle. Recovery is cleanup only; diagnose the original defect later from preserved evidence.

## Preconditions

- The recovery agent must not depend on the ChatGPT-Web runtime it is about to manipulate.
- The affected logical turn must be abandoned; do not cancel a merely slow turn that still owns useful work.
- Preserve any already-known trace ID, execution key/hash, Goose session ID, and causal error before mutation.
- Use only the supported daemon health surface and `codex-chatgpt-web service cancel-turns`.

If the agent is not out of band, or it cannot establish that the affected work is abandoned, return **BLOCKED** without mutation.

## Authoritative state

Read `GET /healthz` from the configured loopback Responses endpoint (default `http://127.0.0.1:17841/healthz`). Project only the fields needed for recovery; do not dump configuration or credentials.

Authoritative turn state is:

- `active_http_turns`
- `active_browser_turns`
- `accepting_turns`
- daemon `status`

The success condition is state, not elapsed time:

```text
active_http_turns = 0
active_browser_turns = 0
```

plus supported runtime health showing the existing infrastructure is usable.

For the runtime-health bracket, use the existing component-specific status surfaces:

- the `/healthz` read must report daemon `status=ok`, `accepting_turns=true`, and `0/0` turn counts;
- in `full` mode, `codex-chatgpt-web tunnel status` must report the managed tunnel service running and runtime `ok=true`, `processRunning=true`, `healthy=true`, `ready=true`, with `state=ready`;
- `codex-chatgpt-web lifecycle status` must report `browserHost.ready=true`;
- `codex-chatgpt-web browser check` must succeed, proving the configured browser path is reachable and, for the launcher BrowserHost, the embedded ChatGPT session is authenticated;
- `codex-chatgpt-web doctor --json` may be captured as diagnostic evidence, but its aggregate `ok` field is **not** a PASS gate. `doctor.ok` is false for any doctor check with `status=error`, including checks outside this recovery contract, and launcher-mode tunnel diagnostics can reflect stale managed-runtime bookkeeping rather than the canonical live tunnel-service health/readiness surface.

Do not ignore a failure from one of the required component-specific checks above merely because another diagnostic is green.

## Recovery state machine

1. **Inspect.** Read `/healthz` and preserve the projected state.
   - If turn counts are already `0/0`, run the component-specific runtime-health bracket above, capture `codex-chatgpt-web doctor --json` for diagnostics, then read `/healthz` again. If both health reads satisfy the daemon requirements, all required component-specific checks pass, and both reads are `0/0`, return **PASS** without cancellation. A non-zero doctor exit caused only by aggregate `ok=false` does not by itself make recovery fail.
   - If `active_browser_turns > 0` and the trigger conditions above are satisfied, continue.
   - If `active_browser_turns = 0` but `active_http_turns > 0`, return **BLOCKED**: there is no retained browser turn for this supported cancellation path to clear. Do not spend cancellation budget on an HTTP-only state.
2. **Cancel current retained work.** Run:

   ```bash
   codex-chatgpt-web service cancel-turns
   ```

   Preserve `cancelledBrowserTurns` from the command output.
3. **Verify state.** Read `/healthz` immediately after cancellation.
   - If `active_browser_turns > 0`, browser work exists again; treat that as caller re-admission and go to the bounded follow-up policy below.
   - If `active_browser_turns = 0` but `active_http_turns > 0`, read `/healthz` once more without issuing another cancellation. HTTP-only activity is not by itself caller re-admission because the cancelled outer stream may still be unwinding. If that second state read still has HTTP-only activity, return **BLOCKED**; if browser work appears, use the re-admission policy; if it reaches `0/0`, continue.
   - Once `0/0` is observed, run the component-specific runtime-health bracket above, capture `codex-chatgpt-web doctor --json` for diagnostics, then read `/healthz` once more. PASS only if the required component-specific checks pass and that final health read still satisfies the daemon requirements with `0/0` turn counts.
   - If browser work reappears during that health bracket, use the bounded re-admission policy. If only HTTP activity remains, return **BLOCKED** rather than spending browser-cancellation budget.
4. **Handle caller re-admission, bounded.** `cancel-turns` opens the retry circuit for currently retained lineages and clears the current browser-turn registry, but it does not drain the daemon or take scheduling authority away from Goose. A live caller can therefore admit a distinct new operation after a successful cancellation.
   - Treat a new non-zero `active_browser_turns` count after cancellation as **caller re-admission**, not as proof that cancellation failed.
   - A single recovery invocation may run `cancel-turns` at most **three times total**: the initial cancellation plus at most two state-triggered follow-ups.
   - After each follow-up, repeat the same `/healthz -> component health + doctor diagnostics -> /healthz` verification when `0/0` is reached.
   - The three-call ceiling is only an action budget that prevents an unbounded cancellation loop. It is not the readiness criterion.
5. **Stop.** If caller re-admission continues after the third cancellation, return **BLOCKED** with `cancellation succeeded but caller is still re-admitting work`. Do not acquire more authority over the caller and do not keep cancelling indefinitely.

## Outcomes

- **PASS** — authoritative turn counts are `0/0` before and after the supported runtime-health bracket; daemon health/acceptance, required tunnel readiness, BrowserHost readiness, and browser authentication/reachability all pass. Aggregate `doctor.ok` is diagnostic only.
- **FAIL** — the supported cancellation command fails, `/healthz` is unavailable/malformed or does not report a healthy accepting daemon, or a required tunnel/BrowserHost/browser component-specific health check fails after clean `0/0` turn state. Unrelated doctor diagnostics alone are not recovery failure.
- **BLOCKED** — the agent is not out of band, the affected work is not clearly abandoned, HTTP-only activity remains outside this browser-cancellation authority, or the caller continues re-admitting browser work after the bounded cancellation budget.

## Stop boundary

On PASS, stop. Do not replay, continue, or resume the failed Goose task. On FAIL or BLOCKED, preserve the remaining authoritative state and return control to a fresh planner/operator; diagnosis is a separate task.

Never automatically:

- kill processes or manipulate Electron windows;
- restart the Responses daemon, Secure MCP Tunnel, or BrowserHost;
- call lifecycle restart/stop;
- replay or continue the failed Goose task;
- edit source or configuration;
- diagnose the root cause during cleanup;
- inspect credentials or Keychain material;
- manipulate Goose SQLite or delete Goose sessions;
- add another supervisor, retry framework, admission fence, or provider-level suppression mechanism.

## Evidence to preserve

Return the preflight and final projected `/healthz` fields, every `cancelledBrowserTurns` result, whether re-admission occurred, tunnel/BrowserHost/browser health evidence, `doctor --json` diagnostic verdict/checks, the already-known causal error/trace identifiers, and whether any process/service was restarted. Do not include secrets.
