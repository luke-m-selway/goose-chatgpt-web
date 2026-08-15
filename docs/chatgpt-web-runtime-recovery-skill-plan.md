# ChatGPT-Web runtime recovery skill plan

Status: **draft for near-term implementation**.

This document turns a now-repeated operational recovery into a reusable agent procedure so a fresh Claude/Codex/Sonnet recovery agent does not have to rediscover the safe cleanup path each time ChatGPT-Web enters a retained-turn / replacement-surface spinout.

It is intentionally a **skill plan**, not runtime implementation. The current supported runtime command already performs the useful recovery. The missing piece is a stable agent-facing procedure for choosing and validating that command before escalating to heavier intervention.

## Recommendation: repo-local agent skill first

Implement this primarily as a repo-local agent skill, for example:

`.agents/skills/chatgpt-web-runtime-recovery/SKILL.md`

Do **not** make the primary recovery contract a Goose recipe.

Reason: the recovery agent is deliberately out-of-band from the affected ChatGPT-Web lineage. It must remain usable when a ChatGPT-Web Goose turn is crashed, retrying, unable to settle, or repeatedly reopening replacement surfaces. Claude/Codex/Sonnet acting from a fresh context can execute the procedure without depending on the provider runtime being repaired.

A small Goose recipe may later wrap the same procedure for convenience, but it should not become a second source of truth.

## Proven recovery evidence

The same minimal recovery has now succeeded repeatedly during ordinary development incidents.

### Incident A — failed same-session continuation spinout

A failed same-session continuation began opening replacement ChatGPT surfaces. The Responses daemon eventually reported **12 active browser turns** despite a moments-earlier health read showing zero, consistent with active resubmission/retry churn.

Recovery:

`codex-chatgpt-web service cancel-turns`

which maps to:

`POST /admin/cancel-browser-turns`

Result:

- active browser turns -> `0`;
- active HTTP turns -> `0`;
- stable for 30 seconds / six checks;
- replacement surfaces stopped reopening;
- daemon, tunnel, and BrowserHost remained healthy;
- no process/service restart;
- no code change.

### Incident B — connector-selection failure spinout

Two crashed fresh ChatGPT-Web chats left **2 active browser turns** retained on the Responses daemon.

Both root symptoms were Playwright `locator.click` timeouts while waiting for the **Goose Native** connector menu item. After the turn failed, replacement ChatGPT surfaces began reopening in the same spinout pattern.

The same command:

`codex-chatgpt-web service cancel-turns`

again cleared retained turns and opened the retry circuit, with:

- active browser turns -> `0`;
- active HTTP turns -> `0`;
- stable for 30 seconds / six checks;
- renderer/helper count stable;
- post-recovery CPU flat;
- daemon healthy and accepting turns;
- tunnel running;
- BrowserHost ready;
- authenticated browser reachable through `browser check`;
- no restart and no code change.

The repeated selector timeout is a separate reliability defect to diagnose/fix. The recovery skill should restore runtime health without trying to repair selector logic during cleanup.

## Skill objective

Given a ChatGPT-Web runtime that appears to be retrying/reopening replacement chats after a failed turn, restore a clean idle runtime using the **smallest supported intervention**, verify that the spinout is actually stopped, and return a compact readiness verdict.

The skill is operational recovery, not incident diagnosis.

## Trigger conditions

Use the skill when one or more of these are observed:

- failed ChatGPT-Web turn followed by replacement Temporary Chat surfaces repeatedly reopening;
- failed same-session continuation that keeps reappearing/retrying;
- daemon reports retained `active_browser_turns` after the caller has abandoned the logical turn;
- visible Electron/BrowserHost churn continues after the user no longer wants the failed turn resumed;
- a known browser-stage failure such as connector selection, send, or control timeout has already terminated the intended task but browser retries continue.

Do not invoke it merely because one ordinary ChatGPT-Web turn is slow.

## Recovery ladder

### Tier 0 — preserve evidence, do not improvise

Before mutation, inspect only enough current runtime state to establish whether a retained-turn spinout exists.

Prefer existing health/admin/status surfaces. Preserve relevant trace/error identity if already available.

Do not begin broad source investigation during recovery.

### Tier 1 — supported turn cancellation

If retained/retrying browser turns exist, run exactly the supported cleanup command:

`codex-chatgpt-web service cancel-turns`

This is the default recovery action.

Expected semantics:

- cancel/clear current browser-turn state;
- open the standalone retry circuit so the cancelled logical turn is not immediately resubmitted;
- clear the daemon ChatGPT turn-session table;
- leave healthy daemon/tunnel/BrowserHost processes running.

Do not replace this with ad-hoc process kills when it succeeds.

### Tier 2 — prove quiescence

After cancellation, verify:

- `active_browser_turns == 0`;
- `active_http_turns == 0`;
- the counts remain zero across a short observation window;
- replacement ChatGPT surfaces stop appearing;
- renderer/helper process count is not growing.

Current proven observation window: **30 seconds, six checks approximately five seconds apart**.

If the runtime remains quiet, do not restart anything.

### Tier 3 — prove runtime health

Verify the existing runtime is still usable:

- Responses daemon healthy and accepting turns;
- tunnel loaded/running/ready;
- BrowserHost ready;
- authenticated embedded ChatGPT browser reachable through the supported `browser check`/doctor path.

If all pass, classify recovery **PASS** and stop.

### Tier 4 — bounded escalation only if Tier 1 fails

Only if supported cancellation does not clear the spinout or the runtime remains unhealthy should the recovery agent inspect the canonical lifecycle controls and choose the smallest supported component reset.

Escalation must remain evidence-based. Prefer canonical lifecycle/service controls over direct `kill`, manual Electron window manipulation, or broad process cleanup.

If the correct supported reset is not clear, stop **BLOCKED** and report the remaining state rather than improvising destructive recovery.

## Explicit non-goals / safety boundaries

During the recovery skill, do **not**:

- continue or retry the failed ChatGPT-Web logical turn;
- reopen the affected same-session continuation merely to test it;
- modify repository code;
- investigate/fix selector, replay, context-size, transport, broker, or BrowserHost architecture defects;
- restart daemon/tunnel/BrowserHost when `cancel-turns` already restored clean idle health;
- kill processes directly unless a later documented escalation explicitly requires it;
- delete persistent Goose sessions as part of browser cleanup unless separate evidence proves they are disposable and implicated;
- inspect or modify credentials/Keychain;
- use Codex merely because the runtime is unhealthy if another fresh capable recovery agent is available;
- commit/push/merge/rebase/reset/stash/clean.

The skill must leave the repo unchanged in the normal successful case.

## Recovery versus diagnosis

Keep these phases separate:

`restore clean idle runtime -> verify -> stop`

then, only in a later dedicated reliability task:

`inspect passive evidence -> localize recurring defect -> repair/validate`

This prevents an urgent cleanup from turning into an uncontrolled architecture or selector rewrite.

For the current recurring Goose Native connector-selection timeout, the skill should preserve the error/trace breadcrumb and recover the runtime. PR #31 / later focused reliability work should own the actual selector/timing diagnosis.

## Proposed skill response contract

A recovery agent should return only:

- `PASS / PARTIAL / BLOCKED`
- stuck-turn state found
- triggering failure/error if already known
- exact recovery action
- processes/services restarted, if any
- active browser/http turn counts after recovery
- quiescence observation result
- replacement surfaces stopped: yes/no
- daemon/tunnel/BrowserHost/browser health
- repo changed: yes/no
- ready for a fresh ChatGPT-Web session: yes/no

This matches the evidence Luke actually needs before resuming work and prevents each agent from producing a long bespoke incident report.

## Candidate SKILL.md body

The first implementation can be intentionally small:

```markdown
---
name: chatgpt-web-runtime-recovery
description: Restore goose-chatgpt-web from retained browser-turn/replacement-surface spinouts using the supported minimal recovery path.
---

# ChatGPT-Web runtime recovery

Use this only for operational cleanup of a failed/retrying ChatGPT-Web runtime.
Do not diagnose or repair the underlying reliability defect unless separately asked.

1. Inspect current daemon turn counts and runtime health only enough to confirm a spinout.
2. If retained/retrying browser turns exist, run:
   `codex-chatgpt-web service cancel-turns`
3. Do not restart services if cancellation succeeds.
4. Verify `active_browser_turns=0` and `active_http_turns=0` remain stable for ~30s.
5. Verify replacement surfaces stop reopening.
6. Verify daemon accepts turns, tunnel is healthy, BrowserHost is ready, and `browser check` reaches the authenticated ChatGPT surface.
7. If all pass, stop and report ready for a fresh ChatGPT-Web session.
8. If cancellation fails or health does not recover, use only documented canonical lifecycle controls for the smallest necessary reset; otherwise stop BLOCKED rather than improvising.

Never continue the failed logical turn, modify code, inspect credentials/Keychain, or kill/restart healthy services during normal cleanup.
```

Before activation, reconcile command/status names against the current CLI and add focused documentation/tests if skill discovery is automated.

## Activation proposal

Once implemented:

1. add the canonical skill under `.agents/skills/chatgpt-web-runtime-recovery/`;
2. add one short AGENTS/recovery rule directing fresh out-of-band agents to apply it when retained-turn/replacement-surface spinout is observed;
3. avoid duplicating the procedure in prompts, recipes, PR comments, and runtime docs;
4. keep this document as evidence/design history or replace it with a link to the canonical skill;
5. optionally add a tiny recipe/wrapper only if real usage shows Goose-side invocation is valuable and safe.

## Implementation priority

**Soon / high leverage.** The cleanup procedure is already repeated and proven. Codifying it will reduce recovery latency, unnecessary service restarts, and repeated exploratory work while the underlying selector/continuation defects are being addressed separately.
