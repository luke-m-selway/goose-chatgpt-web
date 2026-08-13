# ChatGPT-Web concurrency and Electron-liveness qualification

Status: **implementation candidate**. Static/unit tests are passing at this checkpoint. An invalid
parent/delegate attempt nevertheless produced useful two-way live evidence in which both slow CDP
probes recovered and BrowserHost heartbeats continued. The committed deterministic three-surface
proof and the separate natural parent → two async children proof remain **NOT RUN / pending**.

Independent review of PR #31 recorded these gates:

- native liveness design: **PASS**;
- the roughly 76–80 second stale-control plus prolonged-indeterminate model: **PASS**;
- qualification analyzer/runner correctness at `c84b28d06702c80cd22b2cb9459898ceef8f4c82`:
  **PASS**;
- exact source/runtime revision match at the runtime reviewed on 2026-08-13: **FAIL**.

Those analyzer/runner repairs are now part of the candidate, but no live proof has been run against
them. The reviewed runtime is not eligible for a qualification baseline: its helper and Electron
processes predated committed liveness evidence. One operator-controlled exact-revision activation
and the content-based preflight below are mandatory before the next baseline.

For reviewed commit `7b998fbaa82adbf5b400c50248478c272b057761`, **CURRENT RUNTIME MATCHES
COMMIT: NO**. The active helper lacked `dom-read-summary failures=` and `nativeRevision=`, the
BrowserHost process predated the committed BrowserHost/control-server writes, and post-start logs did
not contain the committed lifecycle object on `browser.turn_started`. This is an operational revision
mismatch, not a native-liveness design failure. It must be repaired only at the next authorized
operator activation boundary; no restart was performed while recording or repairing this checkpoint.

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

## Mandatory exact-revision activation and preflight

This is an **operator-only, disruptive prerequisite**, not part of `baseline`, `analyze`, or the
qualification runner. Do not perform it from a turn using the runtime being restarted. It pins the
exact independently reviewed repair commit; every check is fail-closed.

```bash
set -euo pipefail

qualification_repo="/Users/luke/Documents/goose-chatgpt-web"
qualification_runtime_home="/Users/luke/.goose-chatgpt-web-dev"
qualification_commit="c84b28d06702c80cd22b2cb9459898ceef8f4c82"
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

## Natural recursive-topology proof

After the deterministic three-surface proof passes, establish a fresh clean monitor baseline and run
the high-model parent using the committed prompt:

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

bun run scripts/chatgpt-web-qualification.ts analyze \
  --baseline "$natural_dir/baseline.json" \
  --json "$natural_dir/analysis.json" \
  --report "$natural_dir/verdict.txt" \
  --expected-traces 3
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

For a valid natural proof, retain and verify all of the following:

- exactly two persisted parent `delegate` calls;
- `source` equals `chatgpt-web-concurrency-child-a` and
  `chatgpt-web-concurrency-child-b`, once each;
- persisted `async: true` on both calls;
- two distinct returned child task/session IDs and the matching child sessions;
- parent-owned shell/read/reasoning work persisted before either `load` call;
- final persisted assistant messages ending in `child-a-ok`, `child-b-ok`, and
  `natural-parent-ok` for the matching sessions;
- exactly three ChatGPT-Web traces with at least 10,000 ms common overlap and Goose Native shell
  evidence for every trace.

The monitor now retains the safe persisted delegate `source`/`async` fields and final assistant text
in `analysis.json`. It still does not independently bind every BrowserHost trace to a Goose session,
prove returned task-ID identity, or score parent-work-before-load ordering. Those remain explicit
natural-proof evidence requirements to verify from persisted Goose session/tool-result artifacts;
the generic analyzer verdict alone must not be presented as recursive-topology proof.

This final test qualifies the natural recursive topology only when the monitor evidence and every
persisted-topology requirement above agree.

## Evidence already observed

The latest invalid attempt formed only parent + child A because the single persisted delegate call
omitted `async: true`. The synchronous delegate later returned a stream-decode network error, and the
parent correctly stopped before child B. It is not a failed three-way liveness proof.

That invalid run did show useful two-way behavior:

- parent slow probe about 5.2 seconds → recovered about 6.6 seconds;
- child A slow probe about 5.0 seconds → recovered about 5.3 seconds;
- BrowserHost heartbeats continued;
- no Electron `unresponsive`, renderer-gone, WebContents-destroyed, or runtime-crash evidence.

The candidate's static/unit coverage, previously qualified long-turn behavior, and earlier
independent concurrency qualifications remain evidence inputs. Neither new live procedure above may
be marked proven until its exact committed command is run and its artifacts are retained.
