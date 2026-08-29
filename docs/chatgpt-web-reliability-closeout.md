# ChatGPT-Web reliability closeout — 2026-08-14

This document is the authoritative closeout for the current Electron/BrowserHost reliability workstream.
It supersedes older deployed-revision status text in the retained qualification procedure.

## Current deployed checkpoint

The deployed development runtime is:

`7f99f187295135de1507c3fcd63aca08e9c01810` — `fix: isolate browser diagnostics from critical stages`

Draft PR #31 remains open and draft. Passive observation remains enabled in the development runtime.
The proven lifecycle/autostart base remains `c624274` plus `dd44b74`; this PR is a separate reliability
checkpoint and does not change those proof boundaries.

Current qualification status:

- native Electron liveness design/review: **PASS**;
- ordinary Goose ChatGPT-Web use under Electron: **ESTABLISHED**;
- persisted same-Goose-session continuation across later turns: **ESTABLISHED**;
- long ChatGPT-Web turns and long Goose Native tool rounds: **ESTABLISHED**;
- ChatGPT-Web parent -> Goose-native -> ChatGPT-Web child: **ESTABLISHED**;
- genuine parent/child overlap: **ESTABLISHED**;
- genuine parent + two async ChatGPT-Web child topology: **ESTABLISHED**;
- genuine three-surface overlap: **ESTABLISHED**;
- reliable parent + two child completion: **NOT QUALIFIED**.

The current operating phase is ordinary-use ecological observation. Do not run designated synthetic
stress/qualification workloads merely to exercise the runtime.

## Natural failure that closed the instrumentation loop

Normal Day Shift / Goose Control work exposed a new pre-send failure after the passive recorder had been
activated. A substantial prompt repeatedly surfaced:

`ChatGPT web login is expired or the Temporary Chat surface is unavailable`

A short repository-read prompt still succeeded, so the incident was investigated from a fresh Goose +
Codex session without modifying or restarting the affected runtime.

The useful traces were:

- `9480a901947a` — real `composer_ready` control timeout;
- `4f823b086f9c` — prompt reached ChatGPT and generation began, but local send acknowledgement stalled;
- `9c6fd72acaca` — successful short control.

The repeated instant failures from several fresh Goose sessions were not independent browser failures:
identical requests reused trace `9480a901947a` and were rejected immediately by the already-open retry
circuit.

### `9480a901947a`

Electron-native screenshots showed an authenticated Plus account, Temporary Chat, and a visibly present
composer throughout the failure. There was no login dialog, session-failure alert, renderer loss, or
mapped Chromium network failure.

The Playwright diagnostic that ran after navigation exceeded its roughly six-second wrapper timeout but
continued executing. It did not settle until roughly 50 seconds later. `composer_ready` started while
that stale diagnostic was still outstanding, and its 40-second stage watchdog then fired. The inner
`activeComposer()` polling loop never produced its own `visibleComposers=N` error because the Playwright
`count()` control operation itself remained outstanding.

Therefore the login-expiry message was a misclassification. The BrowserHost/WebContents remained alive,
authenticated, and visibly usable while the Playwright/CDP control path was stalled.

### `4f823b086f9c`

This full prompt passed composer readiness, session verification, effort selection, Goose Native
selection, and complete prompt attachment. Native screenshots showed ChatGPT generating after
`send-button.press("Enter")` began, but the Playwright press acknowledgement never completed before the
stage watchdog. This confirmed that the failure class was broader than composer readiness: browser-side
work could progress while the automation/control acknowledgement path was delayed.

The substantial prompt also exposed a separate performance signal: prompt attachment took about 21.2
seconds versus about 2.8 seconds for the shorter successful request. That is a later optimization item,
not the cause of the earlier `composer_ready` stall.

## Root cause and repair

The strongest supported cause of the pre-send incident was self-interference in the Playwright/CDP
control path: a diagnostic could outlive its timeout wrapper and overlap a subsequent critical browser
stage on the same trace. The passive Electron-native recorder was useful independent evidence during the
incident and was not disabled.

Commit `7f99f187295135de1507c3fcd63aca08e9c01810` applies the narrow repair:

- launcher/Electron turns no longer run routine Playwright screenshot/evaluate diagnostics on the
  critical browser path;
- the Electron-native passive recorder remains enabled;
- managed-Chrome diagnostics are limited to terminal `turn-failed` capture;
- outstanding timed-out diagnostics are tracked per trace, and another critical stage for that trace
  fails immediately rather than overlapping stale diagnostic work;
- the 30-second progress notice reuses the existing response DOM snapshot instead of launching another
  diagnostic evaluation;
- `composer_ready` no longer rewrites every failure as login expiry;
- real stage timeout or Playwright/CDP errors are preserved;
- explicit session/authentication evidence retains its typed classification;
- composer telemetry records count state, outstanding count operations, timeouts/failures, late
  settlement, and bounded sanitized reasons such as `target_closed` or
  `execution_context_destroyed`.

No timeout budget, retry budget, concurrency limit, Responses-body behavior, Goose Control behavior, or
passive-recorder policy changed as part of this repair.

## Validation and activation

Before activation the repair passed:

- focused control-path and browser-worker contracts: 93 tests;
- focused BrowserHost/flight-recorder suites: 34 root + 60 launcher tests;
- full `bun run verify`;
- `git diff --check`.

Activation was performed only after proving zero active HTTP turns and zero active browser turns, with
an atomic drain/resume proof. One canonical lifecycle restart was used.

Post-activation identities were:

- Responses daemon PID `74277`;
- BrowserHost PID `74159`;
- tunnel PID `74134`.

The runtime configuration hash remained unchanged, `observation.enabled` remained `true`, and fresh
post-activation process-start events were recorded by the passive recorder. No designated ChatGPT-Web
workload was run during activation.

The first ordinary Day Shift / Goose Control retry using the substantial workload that had exposed the
problem appeared to proceed normally after activation. Treat this as encouraging ecological evidence,
not as a new formal qualification verdict.

### Subsequent broker-timeout continuation observation

Later ordinary ChatGPT-Web work produced a useful inline recovery signal after two targeted edits had
already landed. The running agent reported:

> The first two targeted edits landed, but the tool bridge then hit a transient ChatGPT-Web broker
> timeout. I’m continuing the same logical session as requested rather than treating that as a
> lost-session condition.

Record this as ecological evidence, not as a formally reconstructed trace verdict. It is consistent with
the current operating assumption that a transient browser/tool-broker failure does not necessarily mean
the Goose logical session has been lost, and that a normal later continuation is preferable to
immediately discarding the session when state remains usable. If the corresponding passive trace is ever
reviewed, correlate the broker event, persisted edits/tool results, outer transport settlement, and the
subsequent continuation before assigning a stronger failure classification.

## Current operating envelope

Use ChatGPT-Web as a normal capable Goose parent. Do not reduce it to single-shot prompts merely because
failures remain possible.

Recommended ordinary use:

- allow multiple consecutive parent turns in the same Goose session;
- allow normal Goose Native tool use and meaningful bounded milestones;
- when a second strong model genuinely adds value, use at most **one ChatGPT-Web child at a time** for
  work such as diff review, adversarial review, independent diagnosis, or architecture/minimalism
  review;
- continue using other qualified workers or Codex ACP where appropriate;
- do not make parent + two simultaneous ChatGPT-Web children the routine pattern yet.

If a browser turn fails but the logical Goose session still appears usable, try a normal later
continuation before declaring the session lost. If BrowserHost/runtime cleanup is actually required,
perform that operational rescue from a fresh Goose + Codex session rather than from the ChatGPT-Web
session that depends on the runtime being manipulated.

Do not add ChatGPT-Web-specific recovery machinery to Goose Control. Goose Control remains
provider-agnostic and belongs in the Day Shift repository.

## Remaining unknowns and later items

These remain open without blocking normal use:

1. Reliable parent + two child completion remains **NOT QUALIFIED** despite established topology and
   overlap.
2. Two earlier natural failures lost outer Responses bodies roughly 603-606 seconds after the last
   successful tool-result continuation while the browser pages remained viable. The precise failing
   layer is still unresolved.
3. ChatGPT-native `Connection interrupted. Waiting for the complete answer`, broker/tool-continuation
   orphaning, and transient broker timeouts remain known natural failure classes. A transient broker
   timeout has now also been observed inline during otherwise productive work without immediately
   forcing abandonment of the logical Goose session; the exact trace-level recovery path remains to be
   correlated if needed.
4. Pre-Goose-Native startup latency remains worth measuring if it is disruptive. The current path waits
   on real Temporary Chat/composer/model-effort readiness rather than one long fixed sleep.
5. Large-prompt attachment latency is a separate performance item; the natural incident measured about
   21.2 seconds for a ~24.6k-character prompt versus about 2.8 seconds for the shorter control.
6. Actual macOS reboot/login -> automatic reconstruction -> ordinary Goose first turn -> separate
   dependent `--resume` remains **NOT RUN**.

If another real failure occurs, preserve the event and inspect the passive observation corpus first.
Do not add heavier instrumentation unless that corpus exposes a specific evidence gap. Successful
ordinary turns are also useful reliability evidence; do not stop healthy work to inspect or protect
the recorder.

## Documentation boundary

[`chatgpt-web-concurrency-qualification.md`](chatgpt-web-concurrency-qualification.md) remains useful as
retained qualification procedure and earlier evidence, but its deployed-revision status text predates
this closeout. Use this document for the current deployed reliability checkpoint.

[`chatgpt-web-flight-recorder.md`](chatgpt-web-flight-recorder.md) remains authoritative for recorder
privacy, storage, and capture behavior.
