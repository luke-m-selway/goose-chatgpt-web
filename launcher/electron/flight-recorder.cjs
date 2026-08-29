const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULTS = Object.freeze({
  screenshotIntervalMs: 25_000,
  rollingScreenshotsPerSurface: 4,
  maxRetainedScreenshotsPerTrace: 12,
  maxScreenshotBytes: 512 * 1024 * 1024,
  screenshotMaxAgeDays: 14,
});

function positive(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function expandUserPath(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function resolveNativeFlightRecorderConfig(value, runtimeHome) {
  return {
    enabled: value?.enabled === true,
    rootDir: typeof value?.rootDir === "string" && path.isAbsolute(expandUserPath(value.rootDir))
      ? path.resolve(expandUserPath(value.rootDir))
      : path.join(runtimeHome, "observations"),
    screenshotIntervalMs: positive(value?.screenshotIntervalMs, DEFAULTS.screenshotIntervalMs),
    rollingScreenshotsPerSurface: positive(value?.rollingScreenshotsPerSurface, DEFAULTS.rollingScreenshotsPerSurface),
    maxRetainedScreenshotsPerTrace: positive(value?.maxRetainedScreenshotsPerTrace, DEFAULTS.maxRetainedScreenshotsPerTrace),
    maxScreenshotBytes: positive(value?.maxScreenshotBytes, DEFAULTS.maxScreenshotBytes),
    screenshotMaxAgeDays: positive(value?.screenshotMaxAgeDays, DEFAULTS.screenshotMaxAgeDays),
  };
}

async function privateDirectory(directory) {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  try { await fs.promises.chmod(directory, 0o700); } catch {}
}

async function atomicPrivateFile(filePath, data) {
  await privateDirectory(path.dirname(filePath));
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.promises.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    await fs.promises.rename(temporary, filePath);
    try { await fs.promises.chmod(filePath, 0o600); } catch {}
  } catch (error) {
    try { await fs.promises.rm(temporary, { force: true }); } catch {}
    throw error;
  }
}

async function appendPrivateDurable(filePath, line) {
  await privateDirectory(path.dirname(filePath));
  const file = await fs.promises.open(filePath, "a", 0o600);
  try {
    await file.write(line);
    await file.sync();
  } finally {
    await file.close();
  }
  try { await fs.promises.chmod(filePath, 0o600); } catch {}
}

function datePart(timestamp) {
  return /^\d{4}-\d{2}-\d{2}T/.test(timestamp) ? timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

async function screenshotFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const visit = async (directory) => {
    for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith(".png")) {
        const info = await fs.promises.stat(target);
        files.push({ path: target, bytes: info.size, modifiedAt: info.mtimeMs });
      }
    }
  };
  await visit(root);
  return files;
}

/** Electron-owned rolling capture. It never opens a CDP/Playwright connection. */
class NativeScreenshotFlightRecorder {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.now = dependencies.now || (() => Date.now());
    this.setInterval = dependencies.setInterval || setInterval;
    this.clearInterval = dependencies.clearInterval || clearInterval;
    this.setTimeout = dependencies.setTimeout || setTimeout;
    this.surfaces = new Map();
    this.pendingObservations = new Map();
  }

  startSurface({ traceId, surfaceId, rendererPid, webContents, getActiveBrowserTurns }) {
    if (!this.config.enabled || this.surfaces.has(surfaceId)) return;
    try {
      const state = {
        traceId,
        surfaceId,
        rendererPid,
        webContents,
        getActiveBrowserTurns,
        startedAt: new Date(this.now()).toISOString(),
        sequence: 0,
        ring: [],
        retained: [],
        inFlight: false,
      };
      state.timer = this.setInterval(() => { void this.captureRolling(state); }, this.config.screenshotIntervalMs);
      state.timer.unref?.();
      this.surfaces.set(surfaceId, state);
      this.recordEvent(state, "screenshot-ring-started", { intervalMs: this.config.screenshotIntervalMs }, "screenshot");
      const pending = this.pendingObservations.get(traceId) || [];
      this.pendingObservations.delete(traceId);
      for (const observation of pending) void this.pin(state, observation.event, observation.eventId);
      setImmediate(() => { void this.pruneGlobal(); });
    } catch {}
  }

  recordProcess(event, detail = {}, role = "electron-browser-host") {
    if (!this.config.enabled) return;
    void (async () => {
      try {
        await privateDirectory(this.config.rootDir);
        const safe = Object.fromEntries(Object.entries(detail).filter(([, value]) => (
          value === null || ["string", "number", "boolean"].includes(typeof value)
        )));
        await appendPrivateDurable(path.join(this.config.rootDir, "processes.jsonl"), `${JSON.stringify({
          version: 1,
          eventId: randomUUID(),
          timestamp: new Date(this.now()).toISOString(),
          category: "process",
          event,
          role,
          ...safe,
        })}\n`);
        if (/(restart|stop|gone|crash|exit)/.test(event)) {
          for (const state of this.surfaces.values()) void this.pin(state, event);
        }
      } catch {}
    })();
  }

  updateSurface(surfaceId, patch) {
    const state = this.surfaces.get(surfaceId);
    if (!state) return;
    if (Number.isInteger(patch?.rendererPid)) state.rendererPid = patch.rendererPid;
  }

  observe(traceId, event, eventId) {
    if (!this.config.enabled) return Promise.resolve();
    const state = [...this.surfaces.values()].find(candidate => candidate.traceId === traceId);
    if (!state) {
      this.pendingObservations.set(traceId, [
        ...(this.pendingObservations.get(traceId) || []).slice(-7),
        { event, eventId },
      ]);
      while (this.pendingObservations.size > 256) {
        this.pendingObservations.delete(this.pendingObservations.keys().next().value);
      }
      return Promise.resolve();
    }
    return this.pin(state, event, eventId);
  }

  record(traceId, event, detail = {}) {
    if (!this.config.enabled) return;
    const state = [...this.surfaces.values()].find(candidate => candidate.traceId === traceId);
    if (state) this.recordEvent(state, event, detail, event === "process-identity" ? "process" : "browser");
  }

  stopSurface(surfaceId, outcome) {
    const state = this.surfaces.get(surfaceId);
    if (!state) return;
    this.surfaces.delete(surfaceId);
    if (state.timer) this.clearInterval(state.timer);
    if (outcome === "completed" && state.ring.length === 0) {
      // Start one final native capture while WebContents is still alive. It is deliberately not
      // awaited by BrowserHost; closing the surface may cancel it without affecting the turn.
      void this.captureRetained(state, "clean-final");
    }
    setImmediate(() => {
      void (async () => {
        try {
          if (outcome === "completed") {
            if (state.ring.length > 0) await this.pinLatest(state, "clean-final");
          } else {
            await this.pin(state, `browser-${outcome}`);
          }
          await Promise.all(state.ring.map(frame => this.removeFrame(frame)));
          state.ring = [];
          this.recordEvent(state, "screenshot-ring-stopped", { outcome }, "screenshot");
        } catch {}
      })();
    });
  }

  destroy() {
    for (const state of this.surfaces.values()) if (state.timer) this.clearInterval(state.timer);
    this.surfaces.clear();
    this.pendingObservations.clear();
  }

  async captureRolling(state) {
    if (state.inFlight || !this.surfaces.has(state.surfaceId)) return;
    const contents = state.webContents;
    if (!contents || contents.isDestroyed?.()) return;
    state.inFlight = true;
    try {
      const image = await contents.capturePage();
      const png = image?.toPNG?.();
      if (!png || png.length === 0) return;
      const timestamp = new Date(this.now()).toISOString();
      const directory = await this.screenshotDirectory(state, timestamp);
      const slot = state.sequence % this.config.rollingScreenshotsPerSurface;
      state.sequence += 1;
      const stem = `rolling-${String(slot).padStart(2, "0")}`;
      const pngPath = path.join(directory, `${stem}.png`);
      const metadataPath = path.join(directory, `${stem}.json`);
      await atomicPrivateFile(pngPath, png);
      const metadata = this.metadata(state, timestamp, ["rolling"]);
      await atomicPrivateFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      state.ring = state.ring.filter(frame => frame.slot !== slot);
      state.ring.push({ slot, pngPath, metadataPath, metadata });
      state.ring.sort((left, right) => left.metadata.timestamp.localeCompare(right.metadata.timestamp));
      while (state.ring.length > this.config.rollingScreenshotsPerSurface) {
        const old = state.ring.shift();
        void this.removeFrame(old);
      }
    } catch {
      // Screenshot failure is telemetry-only and cannot reject the browser turn.
    } finally {
      state.inFlight = false;
    }
  }

  async pin(state, reason, eventId) {
    try {
      for (const frame of state.ring) await this.retainFrame(state, frame, reason, eventId);
      void this.captureRetained(state, reason, eventId);
      const postDelay = Math.min(5_000, Math.max(1_000, Math.floor(this.config.screenshotIntervalMs / 4)));
      const timer = this.setTimeout(() => { void this.captureRetained(state, `${reason}-post`, eventId); }, postDelay);
      timer.unref?.();
    } catch {}
  }

  async pinLatest(state, reason) {
    const latest = state.ring[state.ring.length - 1];
    if (latest) await this.retainFrame(state, latest, reason);
  }

  async captureRetained(state, reason, eventId) {
    if (state.inFlight || state.retained.length >= this.config.maxRetainedScreenshotsPerTrace) return;
    const contents = state.webContents;
    if (!contents || contents.isDestroyed?.()) return;
    state.inFlight = true;
    try {
      const image = await contents.capturePage();
      const png = image?.toPNG?.();
      if (!png || png.length === 0) return;
      const timestamp = new Date(this.now()).toISOString();
      const directory = await this.screenshotDirectory(state, timestamp);
      const stem = `retained-${String(state.retained.length + 1).padStart(2, "0")}-${randomUUID().slice(0, 8)}`;
      const pngPath = path.join(directory, `${stem}.png`);
      const metadataPath = path.join(directory, `${stem}.json`);
      const metadata = this.metadata(state, timestamp, [reason], eventId);
      await atomicPrivateFile(pngPath, png);
      await atomicPrivateFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      state.retained.push({ pngPath, metadataPath, metadata });
      this.recordEvent(state, "screenshot-retained", { reason, eventId, bytes: png.length }, "screenshot");
    } catch {
      // Never surface observation failures to BrowserHost.
    } finally {
      state.inFlight = false;
    }
  }

  async retainFrame(state, frame, reason, eventId) {
    if (state.retained.length >= this.config.maxRetainedScreenshotsPerTrace) return;
    const directory = await this.screenshotDirectory(state, frame.metadata.timestamp);
    const stem = `retained-${String(state.retained.length + 1).padStart(2, "0")}-${randomUUID().slice(0, 8)}`;
    const pngPath = path.join(directory, `${stem}.png`);
    const metadataPath = path.join(directory, `${stem}.json`);
    await fs.promises.copyFile(frame.pngPath, pngPath);
    const metadata = { ...frame.metadata, retentionReasons: [reason], ...(eventId ? { eventIds: [eventId] } : {}) };
    await atomicPrivateFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    state.retained.push({ pngPath, metadataPath, metadata });
    this.recordEvent(state, "screenshot-retained", { reason, eventId, source: "rolling" }, "screenshot");
  }

  metadata(state, timestamp, reasons, eventId) {
    return {
      version: 1,
      timestamp,
      traceId: state.traceId,
      surfaceId: state.surfaceId,
      rendererPid: state.rendererPid ?? null,
      activeBrowserTurns: Number(state.getActiveBrowserTurns?.() ?? 0),
      retentionReasons: reasons,
      ...(eventId ? { eventIds: [eventId] } : {}),
    };
  }

  async screenshotDirectory(state, timestamp) {
    const directory = path.join(this.config.rootDir, datePart(state.startedAt || timestamp), state.traceId, "screenshots");
    await privateDirectory(directory);
    return directory;
  }

  recordEvent(state, event, detail = {}, category = "screenshot") {
    void (async () => {
      try {
      const timestamp = new Date(this.now()).toISOString();
      const directory = path.join(this.config.rootDir, datePart(state.startedAt || timestamp), state.traceId);
      await privateDirectory(directory);
      const safe = Object.fromEntries(Object.entries(detail).filter(([, value]) => (
        value === null || ["string", "number", "boolean"].includes(typeof value)
      )));
      await appendPrivateDurable(path.join(directory, "events.jsonl"), `${JSON.stringify({
        version: 1,
        eventId: randomUUID(),
        timestamp,
        category,
        event,
        traceId: state.traceId,
        surfaceId: state.surfaceId,
        rendererPid: state.rendererPid ?? null,
        activeBrowserTurns: Number(state.getActiveBrowserTurns?.() ?? 0),
        ...safe,
      })}\n`);
      } catch {}
    })();
  }

  async removeFrame(frame) {
    if (!frame) return;
    try { await fs.promises.rm(frame.pngPath, { force: true }); } catch {}
    try { await fs.promises.rm(frame.metadataPath, { force: true }); } catch {}
  }

  async pruneGlobal() {
    if (!this.config.enabled) return;
    try {
      const files = (await screenshotFiles(this.config.rootDir)).sort((left, right) => left.modifiedAt - right.modifiedAt);
      const cutoff = this.now() - this.config.screenshotMaxAgeDays * 86_400_000;
      let bytes = files.reduce((total, file) => total + file.bytes, 0);
      for (const file of files) {
        if (file.modifiedAt >= cutoff && bytes <= this.config.maxScreenshotBytes) continue;
        try {
          await fs.promises.rm(file.path, { force: true });
          await fs.promises.rm(file.path.replace(/\.png$/, ".json"), { force: true });
          bytes -= file.bytes;
        } catch {}
      }
    } catch {}
  }
}

module.exports = {
  DEFAULTS,
  NativeScreenshotFlightRecorder,
  resolveNativeFlightRecorderConfig,
};
