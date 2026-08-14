# ChatGPT-Web passive flight recorder

The flight recorder is an optional, in-process observation layer for ordinary ChatGPT-Web usage. It
has zero authority over runtime decisions: it does not start Goose, create turns or browser surfaces,
poll Goose, keep a turn alive, attach another browser client, change a timeout, or participate in
retry/error classification. Every write, screenshot, retention, and screenshot-pin failure is
best-effort and is discarded rather than propagated into a turn.

## Enable or disable

Add the optional `observation` object to the runtime home's `config.json`:

```json
{
  "observation": {
    "enabled": true
  }
}
```

The configured runtime home is `CODEX_CHATGPT_WEB_HOME` (otherwise
`~/.codex-chatgpt-web`). The default observation root is `<runtime-home>/observations`. An absolute
local path may be selected with `observation.rootDir`. The daemon and Electron BrowserHost read the
option during their normal startup; no observer command or separate process is required. Set
`enabled` to `false` to disable future recording. A config change takes effect the next time those
runtime owners are normally started; enabling this option does not authorize an agent to restart
them.

The complete optional configuration and defaults are:

```json
{
  "observation": {
    "enabled": true,
    "rootDir": "/absolute/local/path/observations",
    "screenshotIntervalMs": 25000,
    "rollingScreenshotsPerSurface": 4,
    "maxRetainedScreenshotsPerTrace": 12,
    "maxScreenshotBytes": 536870912,
    "screenshotMaxAgeDays": 14
  }
}
```

## Records and lifecycle

Each routed `/v1/responses` request is recorded as soon as its ChatGPT-Web route and deterministic
browser trace are known. Browser attempt records begin when the existing worker starts the attempt.
They become independently useful when that attempt ends; no permanent Goose-session close event is
required. Provider continuations can append more request and broker events to the same trace journal.

The layout is:

```text
observations/
  index.jsonl
  YYYY-MM-DD/
    <trace-id>/
      events.jsonl
      summary.json
      screenshots/
        rolling-*.png
        rolling-*.json
        retained-*.png
        retained-*.json
```

`events.jsonl` uses single-line, append-mode JSON records. `summary.json` is atomically replaced from
the trace journal, and `index.jsonl` receives a compact record when a browser attempt terminates.
Trace summaries contain request/trace identity hashes, trusted session identity when already present,
transport outcomes, browser lifecycle/outcomes, compact broker lifecycle, retry lineage, concurrency,
transient UI state, process identity observed naturally, and screenshot counts.
Tunnel PID replacement is recorded from the launcher's existing health monitor; the recorder adds no
process polling of its own.

Responses settlement records include aggregate SSE frame/byte/heartbeat counts, the elapsed time of
the last successful enqueue, terminal/DONE enqueue flags, and aggregate outer-body chunk/byte/last-
activity timing. Individual text frames, heartbeats, and HTTP chunks are not journaled. BrowserHost
also records its existing native load-start/load-finish/load-stop and in-page-navigation callbacks.
Navigation records contain only origin/Temporary-Chat booleans and a deterministic origin/path hash;
query values, fragments, and complete URLs are omitted. Navigation after the initial Temporary Chat
bootstrap pins the existing native screenshot ring.

Structured records deliberately exclude prompt and assistant bodies, tool arguments and result
bodies, request headers, cookies, authentication material, and secrets. Error telemetry records
classification/name metadata, not arbitrary payload text. Structured journals and summaries are not
age-pruned automatically. Screenshots necessarily contain visible local ChatGPT content; they remain
inside the observation root and are never analyzed, OCRed, or uploaded by the recorder.

## Native screenshot policy

Only the Electron process that already owns a BrowserHost surface captures its pixels, using
`webContents.capturePage()`. The recorder never creates a Playwright/CDP connection and does not use
the worker's contended diagnostic screenshot path. A non-Electron managed-Chrome runtime still gets
structured telemetry but does not fall back to screenshot capture.

Each active surface has a 25-second capture timer and a four-frame rolling ring. Interesting events
pin available pre-event frames, request a best-effort event-near native capture, and request one short
post-event capture while the surface still exists. At most 12 retained frames are kept per trace. A
clean completion retains only the latest rolling control frame when available. Old screenshot files
are pruned at 14 days or when aggregate screenshot storage exceeds 512 MiB, oldest first. These limits
do not delete structured trace summaries.

Interesting events include the already-observed ChatGPT connection-interrupted state, browser/control
slow or terminal states, send/stage/diagnostic timeouts, Responses failure/incomplete/body error or
client cancellation, retry retirement/replacement, renderer loss, and abnormal broker revocation.
The BrowserHost receives pin hints over its existing authenticated loopback control service; a failed
hint or capture is ignored.
