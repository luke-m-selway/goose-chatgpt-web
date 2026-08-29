import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { appendFile, chmod, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface FlightRecorderConfig {
  enabled: boolean;
  rootDir?: string;
  screenshotIntervalMs?: number;
  rollingScreenshotsPerSurface?: number;
  maxRetainedScreenshotsPerTrace?: number;
  maxScreenshotBytes?: number;
  screenshotMaxAgeDays?: number;
}

export interface ResolvedFlightRecorderConfig {
  enabled: boolean;
  rootDir: string;
  screenshotIntervalMs: number;
  rollingScreenshotsPerSurface: number;
  maxRetainedScreenshotsPerTrace: number;
  maxScreenshotBytes: number;
  screenshotMaxAgeDays: number;
}

export const DEFAULT_FLIGHT_RECORDER_SCREENSHOT_INTERVAL_MS = 25_000;
export const DEFAULT_FLIGHT_RECORDER_ROLLING_SCREENSHOTS = 4;
export const DEFAULT_FLIGHT_RECORDER_RETAINED_SCREENSHOTS = 12;
export const DEFAULT_FLIGHT_RECORDER_SCREENSHOT_BYTES = 512 * 1024 * 1024;
export const DEFAULT_FLIGHT_RECORDER_SCREENSHOT_MAX_AGE_DAYS = 14;

function runtimeHome(): string {
  const configured = process.env.CODEX_CHATGPT_WEB_HOME?.trim();
  return resolve(expandPath(configured || join(homedir(), ".codex-chatgpt-web")));
}

function expandPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

export function resolveFlightRecorderConfig(
  value: FlightRecorderConfig | undefined,
  runtimeHomePath = runtimeHome(),
): ResolvedFlightRecorderConfig {
  const positive = (candidate: number | undefined, fallback: number): number => (
    Number.isSafeInteger(candidate) && candidate! > 0 ? candidate! : fallback
  );
  const rootDir = value?.rootDir?.trim()
    ? resolve(expandPath(value.rootDir.trim()))
    : join(runtimeHomePath, "observations");
  return {
    enabled: value?.enabled === true,
    rootDir,
    screenshotIntervalMs: positive(value?.screenshotIntervalMs, DEFAULT_FLIGHT_RECORDER_SCREENSHOT_INTERVAL_MS),
    rollingScreenshotsPerSurface: positive(value?.rollingScreenshotsPerSurface, DEFAULT_FLIGHT_RECORDER_ROLLING_SCREENSHOTS),
    maxRetainedScreenshotsPerTrace: positive(value?.maxRetainedScreenshotsPerTrace, DEFAULT_FLIGHT_RECORDER_RETAINED_SCREENSHOTS),
    maxScreenshotBytes: positive(value?.maxScreenshotBytes, DEFAULT_FLIGHT_RECORDER_SCREENSHOT_BYTES),
    screenshotMaxAgeDays: positive(value?.screenshotMaxAgeDays, DEFAULT_FLIGHT_RECORDER_SCREENSHOT_MAX_AGE_DAYS),
  };
}

export function validateFlightRecorderConfig(value: unknown, configPath: string): FlightRecorderConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid observation config in ${configPath}`);
  }
  const parsed = value as Partial<FlightRecorderConfig>;
  if (typeof parsed.enabled !== "boolean") throw new Error(`Invalid observation.enabled in ${configPath}`);
  if (parsed.rootDir !== undefined) {
    if (typeof parsed.rootDir !== "string" || !parsed.rootDir.trim()) {
      throw new Error(`Invalid observation.rootDir in ${configPath}`);
    }
    if (!isAbsolute(expandPath(parsed.rootDir))) {
      throw new Error(`observation.rootDir must be absolute in ${configPath}`);
    }
  }
  for (const key of [
    "screenshotIntervalMs",
    "rollingScreenshotsPerSurface",
    "maxRetainedScreenshotsPerTrace",
    "maxScreenshotBytes",
    "screenshotMaxAgeDays",
  ] as const) {
    const candidate = parsed[key];
    if (candidate !== undefined && (!Number.isSafeInteger(candidate) || candidate <= 0)) {
      throw new Error(`Invalid observation.${key} in ${configPath}`);
    }
  }
  return parsed as FlightRecorderConfig;
}

export type FlightEventValue = string | number | boolean | null | string[] | number[];

export interface FlightEventInput {
  category: "request" | "responses" | "browser" | "broker" | "retry" | "process" | "screenshot";
  event: string;
  traceId: string;
  requestId?: string;
  timestamp?: string;
  elapsedMs?: number;
  [field: string]: FlightEventValue | undefined;
}

interface TraceState {
  traceId: string;
  startedAt: string;
  startedMs: number;
  lastAt: string;
  model?: string;
  effort?: string;
  agentSessionId?: string;
  executionKeyHash?: string;
  lineageId?: string;
  surfaceId?: string;
  rendererPid?: number;
  maxActiveBrowserTurns: number;
  brokerCallIds: Set<string>;
  unresolvedBrokerCallIds: Set<string>;
  retryCount: number;
  replacementTraceId?: string;
  transientConnectionInterrupted: boolean;
  abnormalProcessEvent: boolean;
  browserOutcome?: string;
  errorClassification?: string;
  responsesTransportOutcome?: string;
  retainedScreenshotCount: number;
  browserActive: boolean;
  endedAt?: string;
  endedMs?: number;
  indexed: boolean;
}

const SAFE_TRACE = /^[A-Za-z0-9_-]{6,128}$/;
const FORBIDDEN_FIELD = /(prompt|answer|argument|result|content|authorization|cookie|secret|credential|header|input|output|token|message|text)/i;

function datePart(timestamp: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(timestamp) ? timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function safeScalar(value: unknown): FlightEventValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 64) {
    if (value.every(item => typeof item === "string")) return value.map(item => item.slice(0, 256));
    if (value.every(item => typeof item === "number" && Number.isFinite(item))) return value;
  }
  return undefined;
}

/** Privacy boundary: only flat bounded metadata is admitted; payload-shaped fields are dropped. */
export function sanitizeFlightEvent(input: FlightEventInput): Record<string, FlightEventValue> {
  if (!SAFE_TRACE.test(input.traceId)) throw new Error("Flight event trace id is invalid");
  const event: Record<string, FlightEventValue> = {
    version: 1,
    timestamp: input.timestamp ?? new Date().toISOString(),
    category: input.category,
    event: input.event.slice(0, 120),
    traceId: input.traceId,
  };
  for (const [key, raw] of Object.entries(input)) {
    if (["category", "event", "traceId", "timestamp"].includes(key) || FORBIDDEN_FIELD.test(key)) continue;
    const value = safeScalar(raw);
    if (value !== undefined) event[key] = typeof value === "string" ? value.slice(0, 1_024) : value;
  }
  return event;
}

export function hashFlightIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class ChatGptFlightRecorder {
  private readonly traces = new Map<string, TraceState>();
  private writes: Promise<void> = Promise.resolve();
  private failed = false;

  constructor(readonly config: ResolvedFlightRecorderConfig) {}

  record(input: FlightEventInput): string | undefined {
    if (!this.config.enabled || this.failed) return undefined;
    try {
      const safe = sanitizeFlightEvent(input);
      const eventId = randomUUID();
      safe.eventId = eventId;
      const shouldIndex = input.event === "browser-attempt-ended"
        || input.event === "sse-activity-settled"
        || (input.category === "responses" && [
          "body-normal-close", "body-error", "client-cancellation",
        ].includes(input.event));
      this.updateState(safe);
      const state = this.traces.get(input.traceId)!;
      const directory = this.traceDirectory(input.traceId, state.startedAt);
      const line = `${JSON.stringify(safe)}\n`;
      this.enqueue(async () => {
        await privateDirectory(directory);
        await appendDurable(join(directory, "events.jsonl"), line);
        await this.writeSummary(input.traceId);
        if (shouldIndex) {
          // BrowserHost release and event-triggered native screenshot pinning happen immediately
          // after the helper reports its outcome. This delay affects only the recorder queue and
          // lets the summary include those cross-process appends without delaying the turn.
          if (input.event === "browser-attempt-ended") {
            await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
          }
          await this.appendIndex(input.traceId);
        }
      });
      return eventId;
    } catch {
      return undefined;
    }
  }

  recordProcess(role: string, event: string, detail: Record<string, FlightEventValue | undefined> = {}): string | undefined {
    if (!this.config.enabled || this.failed) return undefined;
    const safeDetail = Object.fromEntries(Object.entries(detail).flatMap(([key, raw]) => {
      if (FORBIDDEN_FIELD.test(key)) return [];
      const value = safeScalar(raw);
      return value === undefined ? [] : [[key, value]];
    }));
    const eventId = randomUUID();
    const record = {
      version: 1,
      eventId,
      timestamp: new Date().toISOString(),
      category: "process",
      event: event.slice(0, 120),
      role: role.slice(0, 80),
      ...safeDetail,
    };
    this.enqueue(() => appendDurable(join(this.config.rootDir, "processes.jsonl"), `${JSON.stringify(record)}\n`));
    return eventId;
  }

  noteScreenshot(traceId: string, count = 1): void {
    const state = this.traces.get(traceId);
    if (!state) return;
    state.retainedScreenshotCount += count;
    this.enqueue(() => this.writeSummary(traceId));
  }

  async flush(): Promise<void> {
    await this.writes;
  }

  traceDirectory(traceId: string, timestamp = new Date().toISOString()): string {
    return join(this.config.rootDir, datePart(timestamp), traceId);
  }

  private enqueue(operation: () => Promise<void>): void {
    this.writes = this.writes.then(operation).catch(() => {
      // A broken observation destination disables this process-local recorder. It can never reject
      // or delay the ChatGPT turn that generated the observation.
      this.failed = true;
    });
  }

  private updateState(event: Record<string, FlightEventValue>): void {
    const traceId = String(event.traceId);
    const timestamp = String(event.timestamp);
    const eventMs = Date.parse(timestamp);
    let state = this.traces.get(traceId);
    if (!state) {
      state = {
        traceId,
        startedAt: timestamp,
        startedMs: Number.isFinite(eventMs) ? eventMs : Date.now(),
        lastAt: timestamp,
        maxActiveBrowserTurns: 0,
        brokerCallIds: new Set(),
        unresolvedBrokerCallIds: new Set(),
        retryCount: 0,
        transientConnectionInterrupted: false,
        abnormalProcessEvent: false,
        retainedScreenshotCount: 0,
        browserActive: false,
        indexed: false,
      };
      this.traces.set(traceId, state);
    }
    state.lastAt = timestamp;
    if (typeof event.model === "string") state.model = event.model;
    if (typeof event.effort === "string") state.effort = event.effort;
    if (typeof event.agentSessionId === "string") state.agentSessionId = event.agentSessionId;
    if (typeof event.executionKeyHash === "string") state.executionKeyHash = event.executionKeyHash;
    if (typeof event.lineageId === "string") state.lineageId = event.lineageId;
    if (typeof event.surfaceId === "string") state.surfaceId = event.surfaceId;
    if (typeof event.rendererPid === "number") state.rendererPid = event.rendererPid;
    if (typeof event.activeBrowserTurns === "number") {
      state.maxActiveBrowserTurns = Math.max(state.maxActiveBrowserTurns, event.activeBrowserTurns);
    }
    if (event.category === "broker" && typeof event.callId === "string") {
      state.brokerCallIds.add(event.callId);
      if (event.event === "broker-queued" || event.event === "broker-delivered") state.unresolvedBrokerCallIds.add(event.callId);
      if (["broker-completed", "broker-failed", "broker-revoked"].includes(String(event.event))) {
        state.unresolvedBrokerCallIds.delete(event.callId);
      }
    }
    if (event.event === "retry-reserved" && typeof event.attempt === "number") state.retryCount = Math.max(0, event.attempt - 1);
    if (typeof event.replacementTraceId === "string") state.replacementTraceId = event.replacementTraceId;
    if (event.event === "chatgpt-transient-connection-interrupted") state.transientConnectionInterrupted = true;
    if (event.event === "browser-attempt-started") state.browserActive = true;
    if ((event.category === "process" && /(restart|stop|gone|crash|exit)/.test(String(event.event)))
      || ["browser-lifecycle-render-process-gone", "browser-lifecycle-destroyed"].includes(String(event.event))) {
      state.abnormalProcessEvent = true;
    }
    if (event.event === "browser-attempt-ended") {
      state.browserActive = false;
      state.browserOutcome = typeof event.outcome === "string" ? event.outcome : "unknown";
      state.errorClassification = typeof event.errorClassification === "string" ? event.errorClassification : undefined;
      state.endedAt = timestamp;
      state.endedMs = Number.isFinite(eventMs) ? eventMs : Date.now();
      if (!state.indexed) {
        state.indexed = true;
      }
    }
    if (event.category === "responses" && [
      "body-normal-close", "body-error", "client-cancellation", "request-signal-abort",
    ].includes(String(event.event))) state.responsesTransportOutcome = String(event.event);
  }

  private stateSummary(state: TraceState): Record<string, unknown> {
    return {
      version: 1,
      traceId: state.traceId,
      start: state.startedAt,
      end: state.endedAt ?? null,
      durationMs: state.endedMs === undefined ? null : Math.max(0, state.endedMs - state.startedMs),
      model: state.model ?? null,
      effort: state.effort ?? null,
      agentSessionId: state.agentSessionId ?? null,
      executionKeyHash: state.executionKeyHash ?? null,
      lineageId: state.lineageId ?? null,
      surfaceId: state.surfaceId ?? null,
      rendererPid: state.rendererPid ?? null,
      maximumActiveBrowserTurns: state.maxActiveBrowserTurns,
      brokerToolCallCount: state.brokerCallIds.size,
      unresolvedBrokerCallCount: state.unresolvedBrokerCallIds.size,
      outcome: state.browserOutcome ?? null,
      errorClassification: state.errorClassification ?? null,
      responsesTransportOutcome: state.responsesTransportOutcome ?? null,
      retryCount: state.retryCount,
      replacementTraceId: state.replacementTraceId ?? null,
      transientConnectionInterrupted: state.transientConnectionInterrupted,
      abnormalProcessEvent: state.abnormalProcessEvent,
      retainedScreenshotCount: state.retainedScreenshotCount,
      lastEventAt: state.lastAt,
    };
  }

  activeTraceIds(): string[] {
    return [...this.traces.values()].filter(state => state.browserActive).map(state => state.traceId);
  }

  private async writeSummary(traceId: string): Promise<void> {
    const state = this.traces.get(traceId);
    if (!state) return;
    const directory = this.traceDirectory(traceId, state.startedAt);
    await privateDirectory(directory);
    const summary = await summarizeJournal(
      join(directory, "events.jsonl"),
      this.stateSummary(state),
      join(this.config.rootDir, "processes.jsonl"),
    );
    await atomicPrivateWrite(join(directory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  }

  private async appendIndex(traceId: string): Promise<void> {
    const state = this.traces.get(traceId);
    if (!state) return;
    const directory = this.traceDirectory(traceId, state.startedAt);
    let events: Array<Record<string, unknown>>;
    try {
      events = (await readFile(join(directory, "events.jsonl"), "utf8")).split("\n").filter(Boolean).flatMap(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? [parsed as Record<string, unknown>]
            : [];
        } catch {
          return [];
        }
      });
    } catch {
      return;
    }
    const browserEnded = events.some(event => event.event === "browser-attempt-ended");
    const transportEnded = events.some(event => [
      "body-normal-close", "body-error", "client-cancellation",
    ].includes(String(event.event)));
    const streamingRequest = events.some(event => event.event === "request-accepted" && event.stream === true);
    const sseSettled = events.some(event => event.event === "sse-activity-settled");
    if (!browserEnded || !transportEnded || (streamingRequest && !sseSettled)) return;

    const markerPath = join(directory, ".indexed-v1");
    let marker;
    try {
      marker = await open(markerPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
      throw error;
    }
    const summary = await summarizeJournal(
      join(directory, "events.jsonl"),
      this.stateSummary(state),
      join(this.config.rootDir, "processes.jsonl"),
    );
    try {
      await privateDirectory(this.config.rootDir);
      await appendDurable(join(this.config.rootDir, "index.jsonl"), `${JSON.stringify({
        ...summary,
        indexedAt: new Date().toISOString(),
      })}\n`);
      await marker.writeFile("indexed\n");
      await marker.sync();
      try { await chmod(markerPath, 0o600); } catch {}
    } catch (error) {
      await marker.close().catch(() => {});
      await rm(markerPath, { force: true }).catch(() => {});
      throw error;
    }
    await marker.close();
  }
}

export function summarizeFlightEvents(
  events: Array<Record<string, unknown>>,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> {
  if (events.length === 0) return fallback;
  const ordered = [...events].sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
  const traceEvents = ordered.filter(event => typeof event.traceId === "string");
  const first = traceEvents[0] ?? ordered[0]!;
  const traceId = String(first.traceId ?? fallback.traceId ?? "unknown");
  const browserEnd = [...traceEvents].reverse().find(event => event.event === "browser-attempt-ended");
  const startAt = String(traceEvents.find(event => event.event === "browser-attempt-started")?.timestamp
    ?? traceEvents.find(event => event.event === "request-accepted")?.timestamp
    ?? first.timestamp);
  const endAt = browserEnd ? String(browserEnd.timestamp) : null;
  const startMs = Date.parse(startAt);
  const endMs = endAt ? Date.parse(endAt) : Number.NaN;
  const calls = new Set<string>();
  const unresolved = new Set<string>();
  let maxActive = 0;
  let retryCount = 0;
  let replacementTraceId = null;
  let transportOutcome = null;
  let transient = false;
  let abnormalProcess = false;
  let screenshots = 0;
  let navigationEvents = 0;
  let unexpectedNavigation = false;
  for (const event of ordered) {
    if (typeof event.activeBrowserTurns === "number") maxActive = Math.max(maxActive, event.activeBrowserTurns);
    if (event.category === "broker" && typeof event.callId === "string") {
      calls.add(event.callId);
      if (event.event === "broker-queued" || event.event === "broker-delivered") unresolved.add(event.callId);
      if (["broker-completed", "broker-failed", "broker-revoked"].includes(String(event.event))) unresolved.delete(event.callId);
    }
    if (event.event === "retry-reserved" && typeof event.attempt === "number") retryCount = Math.max(retryCount, event.attempt - 1);
    if (typeof event.replacementTraceId === "string") replacementTraceId = event.replacementTraceId;
    if (event.event === "chatgpt-transient-connection-interrupted") transient = true;
    if ((event.category === "process" && /(restart|stop|gone|crash|exit)/.test(String(event.event)))
      || ["browser-lifecycle-render-process-gone", "browser-lifecycle-destroyed"].includes(String(event.event))) {
      abnormalProcess = true;
    }
    if (["body-normal-close", "body-error", "client-cancellation", "request-signal-abort"].includes(String(event.event))) {
      transportOutcome = event.event;
    }
    if (event.event === "screenshot-retained") screenshots += 1;
    if (String(event.event).startsWith("browser-navigation-")) {
      navigationEvents += 1;
      if (event.unexpectedNavigation === true) unexpectedNavigation = true;
    }
  }
  const latest = (field: string) => [...ordered].reverse().find(event => event[field] !== undefined)?.[field] ?? null;
  return {
    version: 1,
    traceId,
    start: startAt,
    end: endAt,
    durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null,
    model: latest("model"),
    backendModel: latest("backendModel"),
    effort: latest("effort"),
    agentSessionId: latest("agentSessionId"),
    executionKeyHash: latest("executionKeyHash"),
    lineageId: latest("lineageId"),
    surfaceId: latest("surfaceId"),
    rendererPid: latest("rendererPid"),
    maximumActiveBrowserTurns: maxActive,
    brokerToolCallCount: calls.size,
    unresolvedBrokerCallCount: unresolved.size,
    outcome: browserEnd?.outcome ?? null,
    errorClassification: browserEnd?.errorClassification ?? null,
    responsesTransportOutcome: transportOutcome,
    sseFrameCount: latest("sseFrameCount"),
    sseByteCount: latest("sseByteCount"),
    heartbeatFrameCount: latest("heartbeatFrameCount"),
    lastSuccessfulEnqueueElapsedMs: latest("lastSuccessfulEnqueueElapsedMs"),
    terminalEventEnqueued: latest("terminalEventEnqueued"),
    doneEnqueued: latest("doneEnqueued"),
    sseSettlement: latest("sseSettlement"),
    bodyChunkCount: latest("bodyChunkCount"),
    bodyByteCount: latest("bodyByteCount"),
    lastSuccessfulBodyChunkElapsedMs: latest("lastSuccessfulBodyChunkElapsedMs"),
    finalBodyOutcome: latest("finalBodyOutcome"),
    navigationEventCount: navigationEvents,
    unexpectedNavigationObserved: unexpectedNavigation,
    lastNavigationKind: latest("navigationKind"),
    lastNavigationUrlPathHash: latest("urlPathHash"),
    retryCount,
    replacementTraceId,
    transientConnectionInterrupted: transient,
    abnormalProcessEvent: abnormalProcess,
    retainedScreenshotCount: screenshots,
    lastEventAt: String(ordered.at(-1)?.timestamp ?? startAt),
  };
}

async function summarizeJournal(
  path: string,
  fallback: Record<string, unknown>,
  processPath?: string,
): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(path, "utf8");
    const events = text.split("\n").filter(Boolean).flatMap(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
      } catch {
        // A final partial append is ignored; complete preceding JSONL records remain useful.
        return [];
      }
    });
    if (processPath && events.length > 0) {
      const timestamps = events.map(event => Date.parse(String(event.timestamp))).filter(Number.isFinite);
      const start = Math.min(...timestamps);
      const browserEnd = [...events].reverse().find(event => event.event === "browser-attempt-ended");
      const end = browserEnd ? Date.parse(String(browserEnd.timestamp)) : Math.max(...timestamps);
      try {
        const processText = await readFile(processPath, "utf8");
        for (const line of processText.split("\n").filter(Boolean)) {
          try {
            const processEvent = JSON.parse(line) as Record<string, unknown>;
            const timestamp = Date.parse(String(processEvent.timestamp));
            if (timestamp >= start && timestamp <= end) events.push(processEvent);
          } catch {}
        }
      } catch {}
    }
    return summarizeFlightEvents(events, fallback);
  } catch {
    return fallback;
  }
}

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  try { await chmod(path, 0o700); } catch {}
}

async function appendDurable(path: string, line: string): Promise<void> {
  await privateDirectory(dirname(path));
  await appendFile(path, line, { encoding: "utf8", mode: 0o600, flag: "a" });
  const file = await open(path, "r");
  try { await file.sync(); } finally { await file.close(); }
  try { await chmod(path, 0o600); } catch {}
}

async function atomicPrivateWrite(path: string, data: string | Uint8Array): Promise<void> {
  await privateDirectory(dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, data, { mode: 0o600, flag: "wx" });
    const file = await open(temporary, "r");
    try { await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    try { await chmod(path, 0o600); } catch {}
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

let singleton: ChatGptFlightRecorder | undefined;
let launcherDescriptorPath: string | undefined;

const SCREENSHOT_TRIGGER_EVENTS = new Set([
  "chatgpt-transient-connection-interrupted",
  "chatgpt-ui-rate-limit",
  "chatgpt-ui-terminal-error",
  "chatgpt-ui-session-failure",
  "stage-action-timeout",
  "diagnostic-action-timeout",
  "body-error",
  "client-cancellation",
  "request-signal-abort",
  "response.failed",
  "response.incomplete",
  "turn-session-retired",
  "retry-circuit-open",
  "retry-replacement-linked",
  "broker-revoked",
  "control-liveness-slow",
  "control-liveness-native-unresponsive",
  "control-liveness-native-gone",
  "control-liveness-native-destroyed",
  "control-liveness-indeterminate",
  "control-liveness-indeterminate-terminal",
]);

export function configureChatGptFlightRecorder(
  config: FlightRecorderConfig | undefined,
  browserHostDescriptorPath?: string,
): ChatGptFlightRecorder {
  launcherDescriptorPath = browserHostDescriptorPath;
  singleton = new ChatGptFlightRecorder(resolveFlightRecorderConfig(config));
  return singleton;
}

function readConfiguredFlightRecorder(): FlightRecorderConfig | undefined {
  try {
    const path = join(runtimeHome(), "config.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      observation?: unknown;
      browserHost?: unknown;
      browserHostDescriptorPath?: unknown;
    };
    launcherDescriptorPath = raw.browserHost === "launcher" && typeof raw.browserHostDescriptorPath === "string"
      ? raw.browserHostDescriptorPath
      : undefined;
    return validateFlightRecorderConfig(raw.observation, path);
  } catch {
    return undefined;
  }
}

export function chatGptFlightRecorder(): ChatGptFlightRecorder {
  singleton ??= new ChatGptFlightRecorder(resolveFlightRecorderConfig(readConfiguredFlightRecorder()));
  return singleton;
}

export function recordChatGptFlightEvent(input: FlightEventInput): string | undefined {
  try {
    const recorder = chatGptFlightRecorder();
    const eventId = recorder.record(input);
    if (eventId && (SCREENSHOT_TRIGGER_EVENTS.has(input.event)
      || (input.event === "browser-attempt-ended" && input.outcome !== "completed")
      || (input.event === "retry-reserved" && typeof input.attempt === "number" && input.attempt > 1))) {
      void notifyNativeScreenshot(input.traceId, input.event, eventId);
    }
    return eventId;
  } catch {
    return undefined;
  }
}

export function recordChatGptProcessEvent(
  role: string,
  event: string,
  detail: Record<string, FlightEventValue | undefined> = {},
): void {
  try {
    const recorder = chatGptFlightRecorder();
    const eventId = recorder.recordProcess(role, event, detail);
    if (eventId && /(restart|stop|gone|crash|exit)/.test(event)) {
      for (const traceId of recorder.activeTraceIds()) void notifyNativeScreenshot(traceId, event, eventId);
    }
  } catch {}
}

async function notifyNativeScreenshot(traceId: string, event: string, eventId: string): Promise<void> {
  try {
    const descriptorPath = launcherDescriptorPath;
    if (!descriptorPath) return;
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as {
      control?: { endpoint?: unknown; token?: unknown };
    };
    const endpoint = descriptor.control?.endpoint;
    const token = descriptor.control?.token;
    if (typeof endpoint !== "string" || typeof token !== "string") return;
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return;
    await fetch(new URL("/v1/observation/event", url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ traceId, event, eventId }),
      signal: AbortSignal.timeout(1_000),
    });
  } catch {
    // A screenshot hint is observation-only; descriptor/control/capture failures are discarded.
  }
}
