const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  NativeScreenshotFlightRecorder,
  resolveNativeFlightRecorderConfig,
} = require("../electron/flight-recorder.cjs");

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-flight-recorder-"));
  let now = Date.UTC(2026, 7, 14, 10, 0, 0);
  const timers = [];
  const config = resolveNativeFlightRecorderConfig({
    enabled: true,
    rootDir: root,
    screenshotIntervalMs: 25_000,
    rollingScreenshotsPerSurface: 3,
    maxRetainedScreenshotsPerTrace: 5,
    ...overrides,
  }, root);
  const recorder = new NativeScreenshotFlightRecorder(config, {
    now: () => now++,
    setInterval: (callback) => ({ callback, unref() {} }),
    clearInterval() {},
    setTimeout: (callback) => {
      const timer = { callback, unref() {} };
      timers.push(timer);
      return timer;
    },
  });
  return { root, recorder, timers, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function surface(recorder, capturePage) {
  const details = {
    traceId: "trace_screenshots",
    surfaceId: "surface_screenshots_0123456789AB",
    rendererPid: 1234,
    webContents: { isDestroyed: () => false, capturePage },
    getActiveBrowserTurns: () => 2,
  };
  recorder.startSurface(details);
  return details;
}

test("native screenshot rolling ring prunes old frames", async () => {
  const f = fixture();
  try {
    let frame = 0;
    const details = surface(f.recorder, async () => ({ toPNG: () => Buffer.from(`frame-${++frame}`) }));
    const state = f.recorder.surfaces.get(details.surfaceId);
    for (let index = 0; index < 7; index += 1) await f.recorder.captureRolling(state);
    const directory = path.join(f.root, "2026-08-14", details.traceId, "screenshots");
    assert.equal(fs.readdirSync(directory).filter(file => /^rolling-.*\.png$/.test(file)).length, 3);
    assert.equal(state.ring.length, 3);
    f.recorder.stopSurface(details.surfaceId, "completed");
    while (state.ring.length > 0) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(fs.readdirSync(directory).filter(file => /^rolling-.*\.png$/.test(file)).length, 0);
    assert.equal(state.retained.length, 1);
  } finally { f.cleanup(); }
});

test("an event observed before a retry surface exists is pinned when that surface starts", async () => {
  const f = fixture();
  try {
    await f.recorder.observe("trace_screenshots", "retry-reserved", "retry-event");
    let frame = 0;
    const details = surface(f.recorder, async () => ({ toPNG: () => Buffer.from(`frame-${++frame}`) }));
    const state = f.recorder.surfaces.get(details.surfaceId);
    while (state.inFlight) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(state.retained.length, 1);
    const metadata = JSON.parse(fs.readFileSync(state.retained[0].metadataPath, "utf8"));
    assert.deepEqual(metadata.eventIds, ["retry-event"]);
  } finally { f.cleanup(); }
});

test("event pin retains pre-event ring frames and an event-near native capture", async () => {
  const f = fixture();
  try {
    let frame = 0;
    const details = surface(f.recorder, async () => ({ toPNG: () => Buffer.from(`frame-${++frame}`) }));
    const state = f.recorder.surfaces.get(details.surfaceId);
    await f.recorder.captureRolling(state);
    await f.recorder.captureRolling(state);
    await f.recorder.observe(details.traceId, "body-error", "event-1");
    while (state.inFlight) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(state.retained.length, 3);
    const metadata = state.retained.map(frame => JSON.parse(fs.readFileSync(frame.metadataPath, "utf8")));
    assert.ok(metadata.every(item => item.traceId === details.traceId && item.surfaceId === details.surfaceId));
    assert.ok(metadata.some(item => item.eventIds?.includes("event-1")));
  } finally { f.cleanup(); }
});

test("native screenshot failure cannot change or reject a turn outcome", async () => {
  const f = fixture();
  try {
    const details = surface(f.recorder, async () => { throw new Error("synthetic capture failure"); });
    const state = f.recorder.surfaces.get(details.surfaceId);
    let turnOutcome = "completed";
    await assert.doesNotReject(() => f.recorder.captureRolling(state));
    await f.recorder.observe(details.traceId, "browser-failed", "event-failure");
    while (state.inFlight) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(turnOutcome, "completed");
    assert.equal(state.retained.length, 0);
  } finally { f.cleanup(); }
});
