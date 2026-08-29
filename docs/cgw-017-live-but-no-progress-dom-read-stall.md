# CGW-017 — Live browser/control path with no model progress after response DOM read failure

Status: **CONFIRMED / UNFIXED**

Observed: 2026-08-17

Affected runtime:
- Goose session: `20260817_48`
- Project: `/Users/luke/Documents/day-shift`
- Provider: `custom_chatgpt_web__local_1`
- Trace: `29cb440050c6`
- Last broker/tool call: `call_KUfMSIlf7BGO` (`shell`)
- Last substantive tool command:
  `git status --short --branch; ... rg -n ...`
- Last genuine model/tool progress: `2026-08-17 19:53:26.792 CEST`

## User-visible symptom

Goose remained in a "working" state for roughly two hours with no new output.

No Electron window was visible. Investigation showed that this part was non-anomalous: the BrowserHost window had been hidden to the tray while the Electron process, renderer, control endpoint, daemon turn ownership, and browser turn ownership remained live.

The real defect was that the ChatGPT response stopped making any observable progress while browser/control liveness continued to succeed.

## Confirmed state

At diagnosis:
- daemon healthy
- `accepting_turns: true`
- `active_http_turns: 1`
- `active_browser_turns: 1`
- BrowserHost/control path alive
- renderer PID alive
- turn ownership matched trace `29cb440050c6`
- no unresolved broker/tool calls
- no further response-state entries after the last completed tool call
- no further broker activity after `19:53:26.792 CEST`

Browser/control heartbeats continued approximately every 10 seconds.

Those heartbeats were not model-progress evidence.

## Progress-vs-liveness evidence

Three independent sources agreed that the response made no genuine progress after `19:53:26.792 CEST`:

1. Browser worker progress tracking:
   - `progressSignature` never reset during the stalled interval.
   - `sinceProgressMs` grew monotonically past `7,016,437 ms`.
   - DOM-read failures accumulated continuously.

2. Persisted Responses state:
   - last persisted state ended at completed function call `call_KUfMSIlf7BGO`.
   - no later `resp_*` state was created.

3. Per-trace flight recorder:
   - no later response-scoped progress milestone was recorded.
   - no later tool/action emission occurred.

Final turn-end DOM-read failure count after cancellation: **1,647**.

The failures continued at approximately one every five seconds until cancellation and did not recover into sustained successful response reads.

## Root cause

`ChatGptTurnDomHealthTracker.update()` contains a `sawResponse` guard equivalent to:

`if (this.sawResponse) return undefined`

Once a response DOM has been observed at least once in a trace, this permanently disables the existing "missing response" terminal-error path.

For this incident:
- a response had previously been seen;
- subsequent response-DOM reads failed continuously;
- browser/control probes such as `document.readyState` continued to succeed;
- therefore the turn could remain active indefinitely despite no model progress.

This created a state in which browser/control liveness was healthy enough to sustain the turn, but response/model liveness had no remaining bounded terminal path.

## Classification

**LIVE-BUT-NO-PROGRESS**

This is not:
- an owner-clock / ~600 s streaming timeout recurrence;
- a GitHub outage or remote `git` wait (the last `git status` + `rg` command was entirely local and had already completed);
- a dead Electron process;
- a stale BrowserHost descriptor;
- an unresolved broker/tool call;
- evidence that elapsed time alone should become a new fixed timeout.

## Recovery

The affected lineage was cancelled through Goose's normal supported Stop/Cancel path.

Cancellation propagated cleanly:
- `browser.tab_released` with `status: "aborted"`
- `browser.turn_ended` with `status: "aborted"`
- normal `AbortSignal` -> `DOMException("ChatGPT web turn aborted", "AbortError")` path
- affected renderer exited
- no second cancellation was required
- daemon was not restarted
- tunnel was not restarted
- BrowserHost launcher was not restarted

Final runtime state:
- daemon healthy
- `accepting_turns: true`
- `active_http_turns: 0`
- `active_browser_turns: 0`
- BrowserHost live readiness passed
- tunnel healthy
- affected Day Shift working tree remained coherent and byte-identical across cancellation

## Required invariant

Browser/control liveness is necessary but not sufficient for turn liveness.

After a response has previously been observed, sustained inability to read current response state combined with absence of response-scoped progress must still have a bounded terminal path.

The repair must **not** simply introduce another arbitrary maximum generation duration.

The terminal condition should be based on evidence such as:
- persistent/repeated response-DOM read failure;
- absence of progress-signature advancement;
- absence of new response/tool state;
- while preserving genuinely slow-but-progressing turns.

Explicit native BrowserHost/renderer death and explicit cancellation remain authoritative terminal conditions.

## Repair scope to investigate

Primary owner:
- `ChatGptTurnDomHealthTracker.update()`
- response-DOM health/progress handling in the shared ChatGPT browser worker path

The existing slow-send/liveness repair should remain intact.

The fix should apply to the shared worker path so parent and delegated ChatGPT-Web child agents receive the same behavior.

## Regression coverage required

At minimum, add deterministic tests for:

1. Response seen once -> response DOM becomes unreadable -> no response progress -> bounded terminal failure.
2. Response seen once -> intermittent DOM read failures -> genuine response progress resumes -> turn survives.
3. Browser/control heartbeats continue while response progress is absent -> heartbeats alone do not reset response-progress failure state.
4. Slow but genuinely progressing generation remains allowed.
5. Explicit cancellation remains immediately authoritative.
6. Native BrowserHost/renderer death remains immediately authoritative.
7. Shared behavior is not identity-specific between parent and delegated child paths.

## Evidence retention

The live runtime trace was:
- `29cb440050c6`
- observations date: `2026-08-17`

Do not require the full raw trace to reproduce the defect. The bounded evidence above is sufficient to preserve the observed failure shape even if normal flight-recorder retention later prunes raw artifacts.
