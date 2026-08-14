# ChatGPT-Web concurrency and Electron-liveness qualification

Status at deployed development revision
`f54ba39305a6e6a101aa599db1409ab46b9666a1`: native liveness design/review **PASS**; genuine parent
plus two async ChatGPT-Web child topology **ESTABLISHED**; genuine three-surface overlap
**ESTABLISHED**; reliable parent-plus-two-child completion **NOT QUALIFIED**. Passive flight
recording is enabled for ordinary single-agent and naturally delegated use. Designated synthetic
qualification is paused in favor of ecological evidence; the committed deterministic and natural
analyzers remain reusable tooling.

Independent review of PR #31 recorded these gates:

- native liveness design: **PASS**;
- the roughly 76–80 second stale-control plus prolonged-indeterminate model: **PASS**;
- qualification analyzer/runner correctness at `c84b28d06702c80cd22b2cb9459898ceef8f4c82`:
  **PASS**;
- exact source/runtime activation at the current deployed development checkpoint
  `f54ba39305a6e6a101aa599db1409ab46b9666a1`: **SATISFIED**;
- passive observation enabled in the deployed runtime: **YES**.

The 2026-08-13 review did find a genuine operational revision mismatch: the then-running helper and
Electron processes predated committed liveness evidence. That finding is historical and was not a
native-liveness design failure. Subsequent exact-revision activations closed it, culminating in the
currently deployed `f54ba39305a6e6a101aa599db1409ab46b9666a1` runtime with observation enabled.

This document is the operating procedure for qualifying the current Electron-native liveness
candidate. It deliberately separates BrowserHost three-surface liveness from recursive Goose
delegation behavior.

## Evidence boundary

The first-party monitor reads only:

- launchd-owned daemon and tunnel process metadata;
- the existing BrowserHost descriptor, including its descriptor-provided helper path;
- the daemon-owned broker socket owner;
- daemon, tunnel, and Electron launcher logs after recorded byte/inode offsets;
- Goose's persisted session database for session and tool-call correlation.

It never leases a surface, calls BrowserHost control, or attaches CDP/Playwright. Log rotation is
followed by inode for one retained generation; an unresolvable rotation becomes an explicit evidence
gap and cannot qualify a run.

The baseline records machine-readable timestamps, process identities, helper executable/script and
SHA-256 identity, log positions, and pre-existing Goose session IDs. A baseline is clean only when
the launcher log has no unmatched `browser.turn_started` event.

`indeterminate` means the recoverable prolonged-indeterminate grace window opened. A delayed probe,
DOM progress, or native `responsive` event may still recover the turn. Only
`indeterminate-terminal` means that grace was exhausted; the analyzer treats only the latter as
terminal control-liveness evidence.

## Retained exact-revision activation and preflight procedure

The exact-runtime activation requirement is **satisfied** for the current deployed development
checkpoint `f54ba39305a6e6a101aa599db1409ab46b9666a1`. The procedure below is retained for a future
explicitly authorized designated run or revision change. It is an **operator-only, disruptive
prerequisite**, not part of `baseline`, `analyze`, or the qualification runner, and must never be
performed from a turn using the runtime being restarted. Set `qualification_commit` to the exact
reviewed target; every check is fail-closed. It is not the current next action.

```bash
set -euo pipefail

qualification_repo="/Users/luke/Documents/goose-chatgpt-web"
qualification_runtime_home="/Users/luke/.goose-chatgpt-web-dev"
qualification_commit="f54ba39305a6e6a101aa599db1409ab46b9666a1"
qualification_launcher_log="/Users/luke/Library/Logs/Codex Web GPT/launcher.jsonl"

cd "$qualification_repo"
test "$(git rev-parse HEAD)" = "$qualification_commit"
git diff --quiet
git diff --cached --quiet
test "$(git hash-object launcher/electron/browser-host.cjs)" = \
  "$(git rev-parse "${qualification_commit}:launcher/electron/browser-host.cjs")"
test "$(git hash-object launcher/electron/control-server.cjs)" = \
  "$(git rev-parse "${qualification_commit}:launcher/electron/control-server.cjs")"

qualification_config="$qualification_runtime_home/config.json"
jq -e --arg entry "$qualification_repo/src/cli.ts" \
  '.runtimeCommand | index($entry) != null' "$qualification_config" >/dev/null

qualification_helper="$qualification_repo/.launcher-runtime/browser-helper.cjs"
bun run scripts/build-browser-helper.ts "$qualification_helper"
qualification_expected_helper_sha256="$(shasum -a 256 "$qualification_helper" | awk '{print $1}')"
qualification_activation_utc="$(bun -e 'process.stdout.write(new Date().toISOString())')"

CODEX_CHATGPT_WEB_HOME="$qualification_runtime_home" \
  bun run src/cli.ts lifecycle restart

qualification_descriptor="$(jq -r '.browserHostDescriptorPath' "$qualification_config")"
qualification_descriptor_helper="$(jq -r '.helper.script' "$qualification_descriptor")"
test "$qualification_descriptor_helper" = "$qualification_helper"
qualification_actual_helper_sha256="$(shasum -a 256 "$qualification_descriptor_helper" | awk '{print $1}')"
test "$qualification_actual_helper_sha256" = "$qualification_expected_helper_sha256"
rg -F 'dom-read-summary failures=' "$qualification_descriptor_helper"
rg -F 'nativeRevision=' "$qualification_descriptor_helper"
rg -F 'indeterminate-terminal' "$qualification_descriptor_helper"

qualification_daemon_pid="$(launchctl print "gui/$(id -u)/io.github.codex-chatgpt-web.daemon" \
  | awk '$1 == "pid" && $2 == "=" { print $3; exit }')"
test -n "$qualification_daemon_pid"
ps -p "$qualification_daemon_pid" -o command= | rg -F "$qualification_repo/src/cli.ts"

qualification_browser_pid="$(jq -r '.pid' "$qualification_descriptor")"
test -n "$qualification_browser_pid"
qualification_browser_cwd="$(lsof -a -p "$qualification_browser_pid" -d cwd -Fn \
  | sed -n 's/^n//p')"
test "$qualification_browser_cwd" = "$qualification_repo/launcher"

jq -e --arg activated "$qualification_activation_utc" '
  select(
    .at >= $activated
    and .event == "browser.turn_started"
    and .detail.lifecycle.status == "active"
    and .detail.lifecycle.event == "created"
    and (.detail.lifecycle.surfaceId | type == "string")
    and (.detail.lifecycle | has("rendererPid"))
    and (.detail.lifecycle.revision | type == "number")
  )
' "$qualification_launcher_log" >/dev/null

CODEX_CHATGPT_WEB_HOME="$qualification_runtime_home" \
  bun run src/cli.ts lifecycle status

qualification_preflight_dir="$qualification_runtime_home/qualification/preflight-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$qualification_preflight_dir"

qualification_launcher_archive="$qualification_preflight_dir/launcher.pre-baseline.jsonl"
qualification_launcher_archive_rotated=""
test -f "$qualification_launcher_log"
if test -f "${qualification_launcher_log}.1"; then
  qualification_launcher_archive_rotated="$qualification_preflight_dir/launcher.pre-baseline.jsonl.1"
  mv "${qualification_launcher_log}.1" "$qualification_launcher_archive_rotated"
fi
mv "$qualification_launcher_log" "$qualification_launcher_archive"

qualification_launcher_archive_manifest="$qualification_preflight_dir/launcher-archives.sha256"
(
  cd "$qualification_preflight_dir"
  for qualification_archived_name in \
    launcher.pre-baseline.jsonl.1 \
    launcher.pre-baseline.jsonl
  do
    test ! -f "$qualification_archived_name" || shasum -a 256 "$qualification_archived_name"
  done
) >"$qualification_launcher_archive_manifest"

qualification_boundary_baseline="$qualification_preflight_dir/clean-boundary-baseline.json"
bun run scripts/chatgpt-web-qualification.ts baseline \
  --runtime-home "$qualification_runtime_home" \
  --output "$qualification_boundary_baseline"
jq -e --arg repositoryRoot "$qualification_repo" --arg runtimeHome "$qualification_runtime_home" '
  .kind == "chatgpt-web-qualification-baseline"
  and .repositoryRoot == $repositoryRoot
  and .runtimeHome == $runtimeHome
  and .evidenceBoundaryClean == true
  and (.evidenceBoundaryNotes | length == 0)
' "$qualification_boundary_baseline" >/dev/null

jq -n \
  --arg commit "$qualification_commit" \
  --arg activatedAt "$qualification_activation_utc" \
  --arg helperPath "$qualification_descriptor_helper" \
  --arg helperSha256 "$qualification_actual_helper_sha256" \
  --arg daemonPid "$qualification_daemon_pid" \
  --arg browserHostPid "$qualification_browser_pid" \
  --arg browserHostCwd "$qualification_browser_cwd" \
  --arg launcherArchive "$qualification_launcher_archive" \
  --arg launcherArchiveRotated "$qualification_launcher_archive_rotated" \
  --arg launcherArchiveManifest "$qualification_launcher_archive_manifest" \
  --arg cleanBoundaryBaseline "$qualification_boundary_baseline" \
  '{commit:$commit, activatedAt:$activatedAt, helperPath:$helperPath,
    helperSha256:$helperSha256, daemonPid:($daemonPid|tonumber),
    browserHostPid:($browserHostPid|tonumber), browserHostCwd:$browserHostCwd,
    launcherArchives:([$launcherArchiveRotated, $launcherArchive] | map(select(length > 0))),
    launcherArchiveManifest:$launcherArchiveManifest,
    cleanBoundaryBaseline:$cleanBoundaryBaseline,
    evidenceBoundaryClean:true}' \
  >"$qualification_preflight_dir/exact-revision.json"
```

The explicit helper build establishes the expected content hash. Canonical `lifecycle restart`, run
from this checkout, rebuilds/starts the development Electron BrowserHost and restarts the daemon in
canonical order. Matching descriptor hash, exact source blobs, daemon command, Electron working
directory, and post-activation lifecycle-aware start evidence prove content identity and origin;
mtime alone is never accepted.

Only after those checks and canonical lifecycle status pass, the procedure moves both launcher log
generations that the boundary scanner reads (`launcher.jsonl.1`, when present, and `launcher.jsonl`)
to retained, hashed files under the preflight evidence directory. The active launcher paths are not
copied or truncated, so stale unmatched historical `lifecycle_*` starts cannot contaminate the next
boundary while their source evidence remains intact. A first-party monitor baseline then recomputes
the boundary and `jq -e` requires `evidenceBoundaryClean == true` with no boundary notes. Retain the
archived logs, hash manifest, `clean-boundary-baseline.json`, and `exact-revision.json` together. The
preflight baseline proves only that cleanup boundary; the deterministic runner must still capture
its own fresh run baseline. If any command fails, stop before any qualification baseline or workload.

## Standalone monitor commands

Store evidence outside the repository. For the current development runtime:

```bash
qualification_dir="/Users/luke/.goose-chatgpt-web-dev/qualification/manual-$(date +%Y%m%d-%H%M%S)"

bun run scripts/chatgpt-web-qualification.ts baseline \
  --runtime-home /Users/luke/.goose-chatgpt-web-dev \
  --output "$qualification_dir/baseline.json"

# Run the separately authorised workload here. Do not run one merely to test the monitor.

bun run scripts/chatgpt-web-qualification.ts analyze \
  --baseline "$qualification_dir/baseline.json" \
  --json "$qualification_dir/analysis.json" \
  --report "$qualification_dir/verdict.txt" \
  --expected-traces 3
```

`analysis.json` is the machine-readable result. `verdict.txt` is the concise human result. Analyze
returns non-zero when the evidence does not qualify the run.

The analyzer reports all post-baseline ChatGPT-Web traces, new Goose sessions, surface/renderer
identity, native lifecycle, control-liveness, DOM-read counts, heartbeats, start/end/release,
process changes, 429/rate-limit evidence, reliable broker/session tool calls, the final persisted
assistant text, narrowly retained delegate `source`/`async` fields, pairwise overlap, and the
all-trace common overlap.

## Deterministic ordinary-Goose three-surface proof

The committed runner launches three independent, ordinary `goose run` processes through the normal
`custom_chatgpt_web__local_1` provider:

- one `chatgpt-web/high` session;
- child A on `chatgpt-web/medium`;
- child B on `chatgpt-web/medium`.

Each recipe requires a bounded read-only repository workload, at least three separate Goose Native
shell calls, and an exact terminal marker. The runner launches them in immediate succession, records
the measured launch spread, retains their Goose session IDs/results, waits for terminal exit, checks
that Git status is byte-for-byte unchanged, and invokes the same analyzer. A marker qualifies only
when the last line of the final assistant message persisted in Goose's `messages` table equals the
expected marker. Occurrence in prompt/user/tool/stream output is not evidence. Stdout/stderr remain
diagnostic artifacts only. The runner writes artifacts only under the chosen external output
directory.

Run only at an explicitly authorised live-test boundary:

```bash
bun run scripts/run-chatgpt-web-three-surface-qualification.ts \
  --runtime-home /Users/luke/.goose-chatgpt-web-dev
```

Optional `--output-dir` and `--timeout-ms` select an external artifact directory and runner timeout.
On timeout the runner interrupts only the three Goose processes it created; it never terminates the
daemon, BrowserHost, helper, tunnel, or a renderer directly.

A pass requires exactly three complete/ready traces, at least **10,000 ms** of measured common
three-way overlap, Goose Native shell evidence for every trace, native active/surface/renderer
identity and at least one BrowserHost heartbeat for every trace, stable
daemon/BrowserHost/tunnel/broker identities, persisted Goose provider/model/shell evidence matching
each runner session, no deterministic native terminal, no `indeterminate-terminal`, no structured
429/rate-limit evidence, intact log continuity, all three persisted final-assistant markers,
captured Goose session IDs, and unchanged repository status. Recoverable `indeterminate` entry by
itself does not fail a run.

429 scanning recognizes explicit HTTP 429/status fields plus `Too Many Requests` and rate-limit
phrases. Bare decimal timings such as `429.955µs` and `8.429µs` are not 429 evidence.

This proves **Electron/BrowserHost three-surface liveness under real ordinary Goose load**. It does
not prove recursive parent-to-child delegation.

## Named child recipes and async behavior

The natural proof uses these project-discovered recipes:

- `chatgpt-web-concurrency-child-a`
- `chatgpt-web-concurrency-child-b`

Both omit `extensions`, so Goose 1.45.0 inherits the parent session's normal enabled extensions and
tools. Their `settings` fix provider `custom_chatgpt_web__local_1`, model
`chatgpt-web/medium`, and a bounded turn count.

Recipe schema **cannot force async execution: NO**. Inspection of Goose 1.45.0's actual `Recipe`
schema shows fields for recipe content, extensions, settings, activities, parameters, response,
sub-recipes, and retry, but no async field. The Summon `delegate` tool separately defines invocation
parameter `async` with default `false`; only `delegate(..., async: true)` selects its background-task
path. The recipes stabilize source identity, provider/model, tools, workload, and marker. They do not
stabilize scheduling.

## Retained natural recursive-topology proof

For a future explicitly authorized designated recursive run, establish a fresh clean monitor
baseline and run the high-model parent using the committed prompt. This remains useful tooling, but
is not the current next action:

```bash
natural_dir="/Users/luke/.goose-chatgpt-web-dev/qualification/natural-$(date +%Y%m%d-%H%M%S)"

bun run scripts/chatgpt-web-qualification.ts baseline \
  --runtime-home /Users/luke/.goose-chatgpt-web-dev \
  --output "$natural_dir/baseline.json"

goose run \
  --provider custom_chatgpt_web__local_1 \
  --model chatgpt-web/high \
  --name chatgpt-web-natural-concurrency \
  --instructions qualification/chatgpt-web-natural-parent.md \
  --output-format stream-json \
  >"$natural_dir/parent.stdout.jsonl" \
  2>"$natural_dir/parent.stderr.log"

bun run scripts/chatgpt-web-qualification.ts natural-analyze \
  --baseline "$natural_dir/baseline.json" \
  --json "$natural_dir/natural-analysis.json" \
  --report "$natural_dir/natural-verdict.txt"
```

The parent prompt requires both calls in one assistant tool-call message when the model/provider
supports multiple calls cleanly:

```text
delegate(source: "chatgpt-web-concurrency-child-a", async: true)
delegate(source: "chatgpt-web-concurrency-child-b", async: true)
```

Goose's Summon contract executes `async: true` calls as background tasks and returns task IDs. The
parent must verify both IDs, do independent shell/read/reasoning work while both tasks remain active,
then `load` both IDs. Missing `async: true`, a synchronous result, or failure to obtain both IDs makes
the attempt **INVALID**, not a BrowserHost-liveness failure.

### `natural-analyze`: what it reconstructs and verifies

`natural-analyze` (implemented by `analyzeNaturalTopology`/`analyzeNaturalTopologyEvidence` in
`src/qualification/chatgpt-web-qualification.ts`) runs the same trace/overlap/process/429 analyzer as
`analyze`, then adds a Goose-session correlation layer reconstructed entirely from persisted
`delegate`/`load`/`peek` tool exchanges — never from a run manifest, since natural runs have none.
It identifies the parent as the one new Goose session that persisted `delegate` calls, resolves each
child's task/session ID from the delegate response text (`Task <id> started in background`), and
independently verifies:

- exactly two persisted parent `delegate` calls, with `source` equal to
  `chatgpt-web-concurrency-child-a` and `chatgpt-web-concurrency-child-b` once each;
- persisted `async: true` on both calls;
- two distinct, resolvable child task/session IDs (a duplicate/replacement child is rejected);
- both delegate calls precede the first `load`/`peek` call (delegate-A, delegate-B, parent Native
  work, first load — in that order);
- at least one parent Goose Native tool call persisted between the delegates and the first load;
- each child's **own final persisted assistant message** — never a background-task registry's
  self-reported `✓ Completed` status, which can wrap a network/stream-decode failure — ends in its
  expected `child-a-ok`/`child-b-ok` marker;
- the parent's own final persisted assistant message ends in `natural-parent-ok`;
- the shared analyzer's trace count, ≥10,000 ms common three-way overlap, process stability, and
  absence of 429/native-terminal evidence.

It reports a **verdict** — `PASS`, `INVALID_TOPOLOGY`, or `FAIL` — plus **component-level results**
(`topologyFormation`, `parentNativeWorkBeforeLoad`, `threeWayOverlap`, `processStability`,
`runtimeIntegrity`, `childCompletion`, `parentMarker`, `nativeLifecycleEvidence`) so a run can
truthfully say things like "topology formation: PASS, three-way overlap: PASS, reliable child
completion: FAIL" instead of collapsing everything into one generic FAIL. `INVALID_TOPOLOGY` is
reserved for `topologyFormation` failures (omitted `async: true`, fewer/more than two delegates, a
load before both children launched, a duplicate/replacement child); a topology that genuinely formed
but whose children/parent failed is reported `FAIL`, never `INVALID_TOPOLOGY`.
`nativeLifecycleEvidence` is informational only (`PASS`/`NOT_ESTABLISHED`, never gates the verdict):
the current runtime generation does not reliably emit native lifecycle evidence on every trace (see
the exact-revision preflight above), and that gap is reported explicitly rather than silently
counted as passing.

For a valid natural proof, `natural-verdict.txt`/`natural-analysis.json` must show `verdict: PASS`
with every gating component (`topologyFormation`, `parentNativeWorkBeforeLoad`, `threeWayOverlap`,
`processStability`, `runtimeIntegrity`, `childCompletion`, `parentMarker`) at `PASS`. The generic
`analyze` verdict alone must never be presented as recursive-topology proof.

## Retained manual actor / passive-observer protocol

This is the retained procedure for a future explicitly authorized human-run natural proof, separate
from the deterministic three-independent-session runner above (which launches its own `goose run`
processes and needs no manual actor). It is not required for the active ordinary-use flight-recording
phase. When used, the observer never starts Goose, never sends anything to ChatGPT-Web, never leases
a BrowserHost surface, and never restarts anything — it only reads already-persisted evidence.

1. Start the observer baseline (`bun run scripts/chatgpt-web-qualification.ts baseline ...`, as
   above).
2. Wait for `MONITOR READY` — the observer's confirmation that the baseline was captured and the
   evidence boundary is clean (or an explicit note of why it is not).
3. Luke manually starts a fresh, ordinary `goose run` ChatGPT-Web High parent session (not launched
   by the observer or any script).
4. Paste the committed strict natural-parent prompt (`qualification/chatgpt-web-natural-parent.md`)
   into that session.
5. The observer remains completely idle while the workload runs: no polling, no log tailing that
   could be mistaken for interaction, no browser/CDP attachment.
6. After the parent session terminates, run the committed `natural-analyze` command against the
   baseline captured in step 1.
7. Classify the **actual** topology that formed, not the requested one — `natural-analyze` derives
   delegate/load ordering, marker evidence, and overlap entirely from persisted Goose and BrowserHost
   evidence, so a run that omitted `async: true` or never obtained a task ID is `INVALID_TOPOLOGY`
   regardless of what the prompt asked for.

## Evidence already observed

An earlier invalid attempt formed only parent + child A because the single persisted delegate call
omitted `async: true`. The synchronous delegate returned a stream-decode network error, and the
parent correctly stopped before child B. It is not a failed three-way liveness proof. That invalid
run did show useful two-way behavior:

- parent slow probe about 5.2 seconds → recovered about 6.6 seconds;
- child A slow probe about 5.0 seconds → recovered about 5.3 seconds;
- BrowserHost heartbeats continued;
- no Electron `unresponsive`, renderer-gone, WebContents-destroyed, or runtime-crash evidence.

On 2026-08-13, following the manual actor / passive-observer protocol above, a natural run **did**
form the full three-way topology and was classified `NATURAL PARENT + 2: FAIL` (not
`INVALID_TOPOLOGY`) by `natural-analyze`:

- parent session `20260813_45` persisted two `delegate` calls, both `async: true`, sources
  `chatgpt-web-concurrency-child-a`/`-b`, both before the first `load` call, with three Goose Native
  shell calls in between (`topologyFormation`, `parentNativeWorkBeforeLoad`: **PASS**);
- three distinct BrowserHost traces with **593,129 ms** measured common three-way overlap
  (`threeWayOverlap`: **PASS**); daemon/BrowserHost/tunnel/broker PIDs were unchanged throughout, and
  no 429/rate-limit or native-terminal evidence was observed (`processStability`,
  `runtimeIntegrity`: **PASS**);
- Child A (session `20260813_46`) persisted **zero** assistant/tool messages — its background task's
  own registry entry reported `✓ Completed` but with output `Network error: Stream decode error:
  error decoding response body`, and its BrowserHost tab never reached `tab_completed`. No
  `child-a-ok` was ever persisted (`childCompletion`: **FAIL**);
- Child B (session `20260813_47`) persisted Goose Native shell calls and a final assistant message
  ending in `child-b-ok` (contributes **PASS** toward `childCompletion`, which still fails overall
  because both children are required);
- the parent's own final persisted message explicitly declined to emit `natural-parent-ok`, stating
  that Child A's result could not be collected (`parentMarker`: **FAIL**);
- no trace showed native active lifecycle evidence at all (`nativeLifecycleEvidence`:
  **NOT_ESTABLISHED**) — the running BrowserHost/helper generation predated the current runtime's
  lifecycle instrumentation; this is the same exact-revision gap the preflight section above exists
  to close, not new evidence of a liveness regression.

This run's characteristics are preserved as fixtures in
`tests/chatgpt-web-natural-topology-qualification.test.ts`, including the "Child A stream-decodes to
nothing, Child B succeeds" case, so future changes to the analyzer are checked against this exact
observed shape.

On 2026-08-14, run `natural-20260814-111148` again formed the valid parent plus two async-child
topology and produced three BrowserHost traces with **89,239 ms** of common three-way overlap.
Process stability, runtime integrity, and native lifecycle evidence passed, but both children ended
with `ChatGPT browser stage timed out: send`. The independent turn broker proved that both submitted
turns nevertheless reached real ChatGPT generation and local `shell` execution: Child A's broker
call completed before its local send-stage timeout, while Child B's completed after its local
timeout. This is a send-acknowledgement/control-path observation failure, not evidence that either
prompt remained unsent. Diagnostic captures also began timing out only after the concurrent
children were active, and their timeout wrapper does not cancel the underlying diagnostic action.

Later run `natural-instrumented-20260814-120226` again formed a genuine parent plus two async-child
topology. Parent trace `cd2f23884e6f`, Child A trace `61dbd9fc8854`, and Child B trace
`67d163585322` all completed the send press and obtained submission acknowledgement on the first
polling iteration; no send timeout occurred. All three performed substantial ChatGPT-Web/Goose
Native work. The run still failed reliable completion:

- Parent and Child A lost their outer Responses bodies about **603–606 seconds** after their last
  successful tool-result continuation. Their existing ChatGPT Temporary Chat pages remained viable
  when outer cancellation aborted the browser turns. Retained evidence did not localize the failure
  to a specific network, Responses bridge, BrowserHost IPC, Playwright transport, or renderer layer.
- Child B's page visibly showed `Connection interrupted. Waiting for the complete answer`. It kept
  the same trace and owned surface; no replacement browser attempt was proved. The evidence then
  available could not distinguish a same-surface navigation, reload, or application reset from a UI
  transition.
- Child B's final Goose tool result was persisted but never completed back through the broker,
  exposing a broker/tool-continuation orphaning class.
- The bounded logs showed tunnel PID replacement `66477 → 67822`, but its causal relevance to the
  stream failures was **NOT ESTABLISHED**. This run predated correlated per-request Electron network-
  failure recording, so it contains no authoritative request-level network-failure event either way.

Together with `natural-20260814-111148`, the observed failure classes are therefore
send/control-acknowledgement false negatives, outer Responses-body failure while browser pages remain
viable, ChatGPT-native interrupted/reset ambiguity, and broker/tool-continuation orphaning. These are
correlations and classifications, not a localized root-cause claim.

The observation-only instrumentation is now committed and deployed through
`f54ba39305a6e6a101aa599db1409ab46b9666a1`. It records correlated request/Responses-body settlement,
browser outcome, broker and retry lineage, same-surface navigation, aggregate last-successful
transport activity, relevant Electron/Chromium request failures, and native screenshot evidence.
It changes no timeout, polling cadence, concurrency, cancellation, retry, recovery, or error
classification.

The candidate's static/unit coverage, previously qualified long-turn behavior, and earlier
independent concurrency qualifications remain evidence inputs. Reliable parent-plus-two-child
completion remains **NOT QUALIFIED**. The chosen next phase is passive ordinary-use evidence; the
deterministic runner and designated natural procedure remain available but are not the current next
action and must not be described as passed without retained passing artifacts.
