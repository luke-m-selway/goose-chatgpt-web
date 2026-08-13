# ChatGPT-Web concurrency and Electron-liveness qualification

Status: **implementation candidate**. Static/unit tests are passing at this checkpoint. An invalid
parent/delegate attempt nevertheless produced useful two-way live evidence in which both slow CDP
probes recovered and BrowserHost heartbeats continued. The committed deterministic three-surface
proof and the separate natural parent → two async children proof remain **NOT RUN / pending**.

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
process changes, 429/rate-limit evidence, reliable broker/session tool calls, pairwise overlap, and
the all-trace common overlap.

## Deterministic ordinary-Goose three-surface proof

The committed runner launches three independent, ordinary `goose run` processes through the normal
`custom_chatgpt_web__local_1` provider:

- one `chatgpt-web/high` session;
- child A on `chatgpt-web/medium`;
- child B on `chatgpt-web/medium`.

Each recipe requires a bounded read-only repository workload, at least three separate Goose Native
shell calls, and an exact terminal marker. The runner launches them in immediate succession, records
the measured launch spread, retains their Goose session IDs/results, waits for terminal exit, checks
that Git status is byte-for-byte unchanged, and invokes the same analyzer. It writes artifacts only
under the chosen external output directory.

Run only at an explicitly authorised live-test boundary:

```bash
bun run scripts/run-chatgpt-web-three-surface-qualification.ts \
  --runtime-home /Users/luke/.goose-chatgpt-web-dev
```

Optional `--output-dir` and `--timeout-ms` select an external artifact directory and runner timeout.
On timeout the runner interrupts only the three Goose processes it created; it never terminates the
daemon, BrowserHost, helper, tunnel, or a renderer directly.

A pass requires exactly three complete/ready traces, a non-zero common overlap, Goose Native shell
evidence for every trace, native active/surface/renderer identity and at least one BrowserHost
heartbeat for every trace, stable daemon/BrowserHost/tunnel/broker identities, persisted Goose
provider/model/shell evidence matching each runner session, no deterministic native terminal, no
prolonged indeterminate terminal, no 429, intact log continuity, all three terminal markers,
captured Goose session IDs, and unchanged repository status.

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

This final test qualifies the natural recursive topology only when monitor evidence also proves the
parent and both children genuinely overlapped and all three used Goose Native shell.

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
