import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { runCommand } from "../process";

export const CHATGPT_WEB_QUALIFICATION_VERSION = 1;
export const DEFAULT_EXPECTED_TRACE_COUNT = 3;
export const MINIMUM_COMMON_OVERLAP_MS = 10_000;

const DAEMON_LABEL = "io.github.codex-chatgpt-web.daemon";
const TUNNEL_LABEL = "io.github.codex-chatgpt-web.tunnel";

export interface ProcessSnapshot {
  daemonPid: number | null;
  browserHostPid: number | null;
  tunnelPid: number | null;
  brokerPid: number | null;
  browserHelperPids: number[];
}

export interface BrowserHelperIdentity {
  descriptorPath: string;
  executablePath: string | null;
  scriptPath: string | null;
  sha256: string | null;
  bytes: number | null;
  modifiedAt: string | null;
}

export interface LogPosition {
  path: string;
  offset: number;
  device: number | null;
  inode: number | null;
  modifiedAt: string | null;
}

export interface QualificationBaseline {
  version: number;
  kind: "chatgpt-web-qualification-baseline";
  capturedAtUtc: string;
  capturedAtLocal: string;
  repositoryRoot: string;
  runtimeHome: string;
  processes: ProcessSnapshot;
  browserHelper: BrowserHelperIdentity;
  logs: Record<string, LogPosition>;
  gooseSessionsDatabase: string;
  existingGooseSessionIds: string[];
  evidenceBoundaryClean: boolean;
  evidenceBoundaryNotes: string[];
}

export interface LifecycleTransition {
  at: string;
  status: "active" | "unresponsive" | "gone" | "destroyed";
  event: "created" | "unresponsive" | "responsive" | "render-process-gone" | "destroyed";
  revision: number | null;
  rendererPid: number | null;
  surfaceId: string | null;
  reason?: string;
}

export interface ControlLivenessEvent {
  kind:
    | "slow"
    | "recovered"
    | "native-unresponsive"
    | "native-responsive"
    | "native-gone"
    | "native-destroyed"
    | "indeterminate"
    | "indeterminate-terminal";
  outstandingMs: number | null;
  sinceHealthyMs: number | null;
  progressing: boolean | null;
  domReadFailures: number | null;
  nativeStatus: string | null;
  nativeEvent: string | null;
  nativeRevision: number | null;
  rendererPid: number | null;
  surfaceId: string | null;
}

export interface ToolCallEvidence {
  callId: string;
  tool: string;
}

export interface TraceEvidence {
  traceId: string;
  tabId: string | null;
  surfaceId: string | null;
  rendererPid: number | null;
  startedAt: string | null;
  endedAt: string | null;
  releasedAt: string | null;
  endStatus: string | null;
  releaseStatus: string | null;
  lifecycle: LifecycleTransition[];
  controlLiveness: ControlLivenessEvent[];
  domReadFailures: number;
  browserHostHeartbeats: {
    count: number;
    firstAt: string | null;
    lastAt: string | null;
    maxGapMs: number | null;
  };
  toolCalls: ToolCallEvidence[];
}

export interface GooseToolCallEvidence {
  name: string;
  createdAt: string | null;
}

export interface GooseDelegateCallEvidence {
  source: string | null;
  async: boolean | null;
  createdAt: string | null;
}

export interface GooseSessionEvidence {
  id: string;
  name: string;
  sessionType: string;
  parentSessionId: string | null;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
  model: string | null;
  toolCalls: GooseToolCallEvidence[];
  delegateCalls: GooseDelegateCallEvidence[];
  finalAssistantMessage: {
    createdAt: string | null;
    text: string;
  } | null;
}

export interface QualificationRunSession {
  role: "high" | "child-a" | "child-b";
  name: string;
  sessionId: string | null;
  provider: string;
  model: string;
  launchedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  terminalMarker: string;
  terminalMarkerObserved: boolean;
  stdoutPath: string;
  stderrPath: string;
}

export interface QualificationRunManifest {
  version: number;
  kind: "chatgpt-web-three-surface-run";
  runId: string;
  repositoryRoot: string;
  runtimeHome: string;
  baselinePath: string;
  launchedAt: string;
  completedAt: string | null;
  launchSpreadMs: number;
  repositoryStatusUnchanged: boolean;
  sessions: QualificationRunSession[];
}

export function qualificationRunTiming(
  sessions: Array<Pick<QualificationRunSession, "launchedAt">>,
  fallbackAt: string,
): { launchedAt: string; launchSpreadMs: number } {
  const launchTimes = sessions
    .map(session => Date.parse(session.launchedAt))
    .filter(Number.isFinite);
  if (launchTimes.length === 0) {
    return { launchedAt: fallbackAt, launchSpreadMs: 0 };
  }
  const earliest = Math.min(...launchTimes);
  return {
    launchedAt: new Date(earliest).toISOString(),
    launchSpreadMs: Math.max(...launchTimes) - earliest,
  };
}

export interface OverlapWindow {
  traces: string[];
  startAt: string | null;
  endAt: string | null;
  durationMs: number;
}

export interface ProcessChange {
  component: keyof ProcessSnapshot;
  before: number | number[] | null;
  after: number | number[] | null;
  kind: "unchanged" | "started" | "stopped" | "restarted" | "changed";
}

export interface RateLimitEvidence {
  source: string;
  line: number;
  traceId: string | null;
}

export interface QualificationAnalysis {
  version: number;
  kind: "chatgpt-web-qualification-analysis";
  analyzedAtUtc: string;
  analyzedAtLocal: string;
  baselineCapturedAt: string;
  verdict: "qualified" | "not-qualified";
  expectedTraceCount: number;
  minimumCommonOverlapMs: number;
  traces: TraceEvidence[];
  gooseSessions: GooseSessionEvidence[];
  processChanges: ProcessChange[];
  rateLimits: RateLimitEvidence[];
  pairwiseOverlap: OverlapWindow[];
  commonOverlap: OverlapWindow;
  runManifest: QualificationRunManifest | null;
  evidenceGaps: string[];
  issues: string[];
}

export interface LogDelta {
  source: string;
  text: string;
  rotated: boolean;
  gap?: string;
}

interface MutableTrace extends TraceEvidence {
  heartbeatTimes: number[];
  lifecycleKeys: Set<string>;
  toolCallIds: Set<string>;
}

interface SafeBrowserDescriptor {
  pid?: unknown;
  helper?: {
    executable?: unknown;
    script?: unknown;
  };
}

interface SafeRuntimeConfig {
  browserHostDescriptorPath?: unknown;
  brokerSocketPath?: unknown;
}

function formatLocalIso(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    + `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : null;
}

function nullableInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  return Number.parseInt(value, 10);
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object at ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function launchctlPid(label: string): number | null {
  if (process.platform !== "darwin") return null;
  const uid = runCommand("id", ["-u"]);
  if (uid.status !== 0) return null;
  const result = runCommand("launchctl", ["print", `gui/${uid.stdout.trim()}/${label}`]);
  if (result.status !== 0) return null;
  return positiveInteger(Number(/^\s*pid = (\d+)\s*$/m.exec(result.stdout)?.[1] ?? 0));
}

function livePid(value: unknown): number | null {
  const pid = positiveInteger(value);
  if (!pid) return null;
  const result = runCommand("ps", ["-p", String(pid), "-o", "pid="]);
  return result.status === 0 && Number(result.stdout.trim()) === pid ? pid : null;
}

function brokerOwnerPid(socketPath: string | null): number | null {
  if (!socketPath || !existsSync(socketPath)) return null;
  const result = runCommand("lsof", ["-nP", socketPath]);
  if (result.status !== 0) return null;
  const line = result.stdout.split(/\r?\n/).find((_value, index) => index > 0);
  return positiveInteger(Number(line?.trim().split(/\s+/)[1] ?? 0));
}

function helperPids(scriptPath: string | null, daemonPid: number | null): number[] {
  if (!scriptPath) return [];
  const result = runCommand("pgrep", ["-f", scriptPath]);
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map(value => positiveInteger(Number(value)))
    .filter((value): value is number => value !== null)
    .filter(pid => {
      if (!daemonPid) return true;
      const parent = runCommand("ps", ["-p", String(pid), "-o", "ppid="]);
      return parent.status === 0 && Number(parent.stdout.trim()) === daemonPid;
    })
    .sort((left, right) => left - right);
}

function filePosition(path: string): LogPosition {
  if (!existsSync(path)) {
    return { path, offset: 0, device: null, inode: null, modifiedAt: null };
  }
  const stat = statSync(path);
  return {
    path,
    offset: stat.size,
    device: Number(stat.dev),
    inode: Number(stat.ino),
    modifiedAt: stat.mtime.toISOString(),
  };
}

export function defaultGooseSessionsDatabase(): string {
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(dataHome, "goose", "sessions", "sessions.db");
}

export function defaultLauncherLogPath(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Logs", "Codex Web GPT", "launcher.jsonl");
  return join(homedir(), ".codex-web-gpt", "logs", "launcher.jsonl");
}

function readGooseSessionIds(databasePath: string): string[] {
  if (!existsSync(databasePath)) return [];
  const database = new Database(databasePath, { readonly: true });
  try {
    return (database.query("SELECT id FROM sessions ORDER BY id").all() as Array<{ id: string }>).map(row => row.id);
  } finally {
    database.close();
  }
}

function activeTraceIdsBeforeBoundary(launcherLogPath: string): string[] {
  const active = new Set<string>();
  for (const path of [`${launcherLogPath}.1`, launcherLogPath]) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      let record: unknown;
      try { record = JSON.parse(line); } catch { continue; }
      if (!record || typeof record !== "object") continue;
      const event = (record as { event?: unknown }).event;
      const detail = (record as { detail?: { traceId?: unknown } }).detail;
      const traceId = typeof detail?.traceId === "string" ? detail.traceId : null;
      if (!traceId) continue;
      if (["browser.turn_started", "browser.turn_heartbeat"].includes(String(event))) active.add(traceId);
      if (event === "browser.turn_ended") active.delete(traceId);
    }
  }
  return [...active].sort();
}

export function captureQualificationBaseline(options: {
  repositoryRoot: string;
  runtimeHome: string;
  launcherLogPath?: string;
  gooseSessionsDatabase?: string;
  now?: Date;
}): QualificationBaseline {
  const now = options.now ?? new Date();
  const repositoryRoot = resolve(options.repositoryRoot);
  const runtimeHome = resolve(options.runtimeHome);
  const configPath = join(runtimeHome, "config.json");
  const config = readJsonObject(configPath) as SafeRuntimeConfig;
  const descriptorPath = typeof config.browserHostDescriptorPath === "string"
    ? resolve(config.browserHostDescriptorPath)
    : join(runtimeHome, "runtime", "launcher-browser.json");
  const descriptor = existsSync(descriptorPath)
    ? readJsonObject(descriptorPath) as SafeBrowserDescriptor
    : {};
  const scriptPath = typeof descriptor.helper?.script === "string" ? resolve(descriptor.helper.script) : null;
  const executablePath = typeof descriptor.helper?.executable === "string" ? resolve(descriptor.helper.executable) : null;
  const brokerSocketPath = typeof config.brokerSocketPath === "string" ? resolve(config.brokerSocketPath) : null;
  const daemonPid = launchctlPid(DAEMON_LABEL);
  const launcherLogPath = resolve(options.launcherLogPath ?? defaultLauncherLogPath());
  const gooseSessionsDatabase = resolve(options.gooseSessionsDatabase ?? defaultGooseSessionsDatabase());
  const activeTraces = activeTraceIdsBeforeBoundary(launcherLogPath);
  const notes = activeTraces.map(traceId => `BrowserHost trace ${traceId} was active at baseline`);
  const logPaths = {
    daemonStdout: join(runtimeHome, "logs", "daemon.stdout.log"),
    daemonStderr: join(runtimeHome, "logs", "daemon.stderr.log"),
    tunnelStdout: join(runtimeHome, "logs", "tunnel.stdout.log"),
    tunnelStderr: join(runtimeHome, "logs", "tunnel.stderr.log"),
    launcher: launcherLogPath,
  };
  return {
    version: CHATGPT_WEB_QUALIFICATION_VERSION,
    kind: "chatgpt-web-qualification-baseline",
    capturedAtUtc: now.toISOString(),
    capturedAtLocal: formatLocalIso(now),
    repositoryRoot,
    runtimeHome,
    processes: {
      daemonPid,
      browserHostPid: livePid(descriptor.pid),
      tunnelPid: launchctlPid(TUNNEL_LABEL),
      brokerPid: brokerOwnerPid(brokerSocketPath),
      browserHelperPids: helperPids(scriptPath, daemonPid),
    },
    browserHelper: {
      descriptorPath,
      executablePath,
      scriptPath,
      sha256: scriptPath && existsSync(scriptPath) ? hashFile(scriptPath) : null,
      bytes: scriptPath && existsSync(scriptPath) ? statSync(scriptPath).size : null,
      modifiedAt: scriptPath && existsSync(scriptPath) ? statSync(scriptPath).mtime.toISOString() : null,
    },
    logs: Object.fromEntries(Object.entries(logPaths).map(([key, path]) => [key, filePosition(path)])),
    gooseSessionsDatabase,
    existingGooseSessionIds: readGooseSessionIds(gooseSessionsDatabase),
    evidenceBoundaryClean: activeTraces.length === 0,
    evidenceBoundaryNotes: notes,
  };
}

function sameFileIdentity(position: LogPosition, path: string): boolean {
  if (!existsSync(path) || position.device === null || position.inode === null) return false;
  const stat = statSync(path);
  return Number(stat.dev) === position.device && Number(stat.ino) === position.inode;
}

function readFromOffset(path: string, offset: number): string {
  const bytes = readFileSync(path);
  if (offset > bytes.byteLength) return "";
  return bytes.subarray(offset).toString("utf8");
}

export function readLogDelta(position: LogPosition): LogDelta {
  const { path, offset } = position;
  if (position.device === null || position.inode === null) {
    return {
      source: path,
      text: existsSync(path) ? readFileSync(path, "utf8") : "",
      rotated: false,
    };
  }
  if (sameFileIdentity(position, path)) {
    const size = statSync(path).size;
    if (size >= offset) return { source: path, text: readFromOffset(path, offset), rotated: false };
    return {
      source: path,
      text: readFileSync(path, "utf8"),
      rotated: true,
      gap: `${path} shrank below its baseline offset`,
    };
  }
  const rotatedPath = `${path}.1`;
  if (sameFileIdentity(position, rotatedPath)) {
    return {
      source: path,
      text: readFromOffset(rotatedPath, offset) + (existsSync(path) ? readFileSync(path, "utf8") : ""),
      rotated: true,
    };
  }
  if (!existsSync(path)) {
    return { source: path, text: "", rotated: false, gap: `${path} is missing after baseline` };
  }
  return {
    source: path,
    text: readFileSync(path, "utf8"),
    rotated: true,
    gap: `${path} changed identity and its baseline inode was not found at ${rotatedPath}`,
  };
}

function createMutableTrace(traceId: string): MutableTrace {
  return {
    traceId,
    tabId: null,
    surfaceId: null,
    rendererPid: null,
    startedAt: null,
    endedAt: null,
    releasedAt: null,
    endStatus: null,
    releaseStatus: null,
    lifecycle: [],
    controlLiveness: [],
    domReadFailures: 0,
    browserHostHeartbeats: { count: 0, firstAt: null, lastAt: null, maxGapMs: null },
    toolCalls: [],
    heartbeatTimes: [],
    lifecycleKeys: new Set(),
    toolCallIds: new Set(),
  };
}

function traceFor(traces: Map<string, MutableTrace>, traceId: string): MutableTrace {
  let trace = traces.get(traceId);
  if (!trace) {
    trace = createMutableTrace(traceId);
    traces.set(traceId, trace);
  }
  return trace;
}

function lifecycleFromDetail(detail: Record<string, unknown>): Record<string, unknown> | null {
  const lifecycle = detail.lifecycle;
  return lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle)
    ? lifecycle as Record<string, unknown>
    : null;
}

function addLifecycle(
  trace: MutableTrace,
  at: string,
  lifecycle: Record<string, unknown>,
): void {
  const status = lifecycle.status;
  const event = lifecycle.event;
  if (!["active", "unresponsive", "gone", "destroyed"].includes(String(status))) return;
  if (!["created", "unresponsive", "responsive", "render-process-gone", "destroyed"].includes(String(event))) return;
  const revision = nullableInteger(lifecycle.revision);
  const rendererPid = positiveInteger(lifecycle.rendererPid);
  const surfaceId = typeof lifecycle.surfaceId === "string" ? lifecycle.surfaceId : null;
  if (rendererPid) trace.rendererPid = rendererPid;
  if (surfaceId) trace.surfaceId = surfaceId;
  const key = `${String(event)}:${String(status)}:${revision ?? "unknown"}`;
  if (trace.lifecycleKeys.has(key)) return;
  trace.lifecycleKeys.add(key);
  trace.lifecycle.push({
    at,
    status: status as LifecycleTransition["status"],
    event: event as LifecycleTransition["event"],
    revision,
    rendererPid,
    surfaceId,
    ...(typeof lifecycle.reason === "string" ? { reason: lifecycle.reason } : {}),
  });
}

function fallbackLifecycle(event: string, detail: Record<string, unknown>, trace: MutableTrace, at: string): void {
  const mapping: Record<string, { status: LifecycleTransition["status"]; event: LifecycleTransition["event"] }> = {
    "browser.tab_renderer_unresponsive": { status: "unresponsive", event: "unresponsive" },
    "browser.tab_renderer_responsive": { status: "active", event: "responsive" },
    "browser.tab_renderer_gone": { status: "gone", event: "render-process-gone" },
    "browser.tab_web_contents_destroyed": { status: "destroyed", event: "destroyed" },
  };
  const mapped = mapping[event];
  if (!mapped) return;
  const previousRevision = trace.lifecycle.map(item => item.revision).filter((value): value is number => value !== null).at(-1);
  addLifecycle(trace, at, {
    ...mapped,
    revision: nullableInteger(detail.lifecycleRevision) ?? (previousRevision === undefined ? null : previousRevision + 1),
    rendererPid: detail.rendererPid,
    surfaceId: detail.surfaceId,
    reason: detail.reason,
  });
}

export function parseLauncherEvidence(text: string, traces = new Map<string, MutableTrace>()): Map<string, MutableTrace> {
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let record: unknown;
    try { record = JSON.parse(line); } catch { continue; }
    if (!record || typeof record !== "object") continue;
    const event = (record as { event?: unknown }).event;
    const at = (record as { at?: unknown }).at;
    const rawDetail = (record as { detail?: unknown }).detail;
    if (typeof event !== "string" || typeof at !== "string" || !rawDetail || typeof rawDetail !== "object") continue;
    const detail = rawDetail as Record<string, unknown>;
    const traceId = typeof detail.traceId === "string" ? detail.traceId : null;
    if (!traceId || !event.startsWith("browser.")) continue;
    const trace = traceFor(traces, traceId);
    if (typeof detail.tabId === "string") trace.tabId = detail.tabId;
    if (typeof detail.surfaceId === "string") trace.surfaceId = detail.surfaceId;
    const rendererPid = positiveInteger(detail.rendererPid);
    if (rendererPid) trace.rendererPid = rendererPid;
    const lifecycle = lifecycleFromDetail(detail);
    if (lifecycle) addLifecycle(trace, at, lifecycle);
    fallbackLifecycle(event, detail, trace, at);

    if (event === "browser.tab_created" || event === "browser.tab_reused") {
      trace.startedAt ??= at;
    } else if (event === "browser.turn_started") {
      trace.startedAt = at;
    } else if (event === "browser.turn_heartbeat") {
      trace.heartbeatTimes.push(Date.parse(at));
    } else if (event === "browser.tab_released") {
      trace.releasedAt = at;
      trace.releaseStatus = typeof detail.status === "string" ? detail.status : null;
    } else if (event === "browser.turn_ended") {
      trace.endedAt = at;
      trace.endStatus = typeof detail.status === "string" ? detail.status : null;
    }
  }
  return traces;
}

function keyValues(line: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of line.matchAll(/([A-Za-z][A-Za-z0-9]*)=("[^"]*"|\S+)/g)) {
    values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return values;
}

function traceIdFromLine(line: string): string | null {
  return /(?:browser turn\s+|broker trace=)([A-Za-z0-9_-]+)/.exec(line)?.[1] ?? null;
}

function isRateLimitEvidence(line: string): boolean {
  if (/(?:too many requests|rate[-_ ]?limit(?:ed|ing)?\b)/i.test(line)) return true;
  return /(?:\bHTTP(?:\/\d(?:\.\d)?)?\s+|["']?(?:status|statusCode|httpStatus)["']?\s*[:=]\s*)429(?![.\w])/i.test(line);
}

export function parseDaemonEvidence(
  text: string,
  traces = new Map<string, MutableTrace>(),
  source = "daemon",
): { traces: Map<string, MutableTrace>; rateLimits: RateLimitEvidence[] } {
  const rateLimits: RateLimitEvidence[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (isRateLimitEvidence(line)) {
      rateLimits.push({ source, line: index + 1, traceId: traceIdFromLine(line) });
    }
    const control = /browser turn ([A-Za-z0-9_-]+) control-liveness=([A-Za-z-]+)/.exec(line);
    if (control) {
      const trace = traceFor(traces, control[1]);
      const values = keyValues(line);
      const kind = control[2] as ControlLivenessEvent["kind"];
      if ([
        "slow",
        "recovered",
        "native-unresponsive",
        "native-responsive",
        "native-gone",
        "native-destroyed",
        "indeterminate",
        "indeterminate-terminal",
      ].includes(kind)) {
        const domReadFailures = nullableInteger(values.domReadFailures);
        trace.controlLiveness.push({
          kind,
          outstandingMs: nullableInteger(values.outstandingMs),
          sinceHealthyMs: nullableInteger(values.sinceHealthyMs),
          progressing: values.progressing === "true" ? true : values.progressing === "false" ? false : null,
          domReadFailures,
          nativeStatus: values.nativeStatus ?? null,
          nativeEvent: values.nativeEvent ?? null,
          nativeRevision: nullableInteger(values.nativeRevision),
          rendererPid: positiveInteger(nullableInteger(values.rendererPid)),
          surfaceId: values.surfaceId && values.surfaceId !== "unavailable" ? values.surfaceId : null,
        });
        if (domReadFailures !== null) trace.domReadFailures = Math.max(trace.domReadFailures, domReadFailures);
        const pid = positiveInteger(nullableInteger(values.rendererPid));
        if (pid) trace.rendererPid = pid;
        if (values.surfaceId && values.surfaceId !== "unavailable") trace.surfaceId = values.surfaceId;
      }
    }
    const domSummary = /browser turn ([A-Za-z0-9_-]+) dom-read-summary failures=(\d+)/.exec(line);
    if (domSummary) traceFor(traces, domSummary[1]).domReadFailures = Number(domSummary[2]);
    const tool = /broker trace=([A-Za-z0-9_-]+) queued call=([^\s]+) tool=([^\s]+)/.exec(line);
    if (tool) {
      const trace = traceFor(traces, tool[1]);
      if (!trace.toolCallIds.has(tool[2])) {
        trace.toolCallIds.add(tool[2]);
        trace.toolCalls.push({ callId: tool[2], tool: tool[3] });
      }
    }
  }
  return { traces, rateLimits };
}

function finalizeTraces(traces: Map<string, MutableTrace>): TraceEvidence[] {
  return [...traces.values()]
    .map(trace => {
      const heartbeatTimes = trace.heartbeatTimes.filter(Number.isFinite).sort((left, right) => left - right);
      let maxGapMs: number | null = null;
      for (let index = 1; index < heartbeatTimes.length; index += 1) {
        maxGapMs = Math.max(maxGapMs ?? 0, heartbeatTimes[index] - heartbeatTimes[index - 1]);
      }
      const { heartbeatTimes: _heartbeatTimes, lifecycleKeys: _lifecycleKeys, toolCallIds: _toolCallIds, ...result } = trace;
      result.lifecycle.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
      result.browserHostHeartbeats = {
        count: heartbeatTimes.length,
        firstAt: heartbeatTimes.length ? new Date(heartbeatTimes[0]).toISOString() : null,
        lastAt: heartbeatTimes.length ? new Date(heartbeatTimes.at(-1)!).toISOString() : null,
        maxGapMs,
      };
      return result;
    })
    .sort((left, right) => Date.parse(left.startedAt ?? "9999-12-31") - Date.parse(right.startedAt ?? "9999-12-31"));
}

function interval(trace: TraceEvidence): { start: number; end: number } | null {
  const start = Date.parse(trace.startedAt ?? "");
  const end = Date.parse(trace.endedAt ?? trace.releasedAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? { start, end } : null;
}

function overlapWindow(traces: TraceEvidence[]): OverlapWindow {
  const intervals = traces.map(interval);
  if (intervals.some(value => value === null) || intervals.length === 0) {
    return { traces: traces.map(trace => trace.traceId), startAt: null, endAt: null, durationMs: 0 };
  }
  const present = intervals as Array<{ start: number; end: number }>;
  const start = Math.max(...present.map(value => value.start));
  const end = Math.min(...present.map(value => value.end));
  return {
    traces: traces.map(trace => trace.traceId),
    startAt: end > start ? new Date(start).toISOString() : null,
    endAt: end > start ? new Date(end).toISOString() : null,
    durationMs: Math.max(0, end - start),
  };
}

function pairwiseOverlaps(traces: TraceEvidence[]): OverlapWindow[] {
  const overlaps: OverlapWindow[] = [];
  for (let left = 0; left < traces.length; left += 1) {
    for (let right = left + 1; right < traces.length; right += 1) {
      overlaps.push(overlapWindow([traces[left], traces[right]]));
    }
  }
  return overlaps;
}

function scalarString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseModel(modelConfigJson: unknown): string | null {
  if (typeof modelConfigJson !== "string" || !modelConfigJson) return null;
  try {
    const parsed = JSON.parse(modelConfigJson) as { model_name?: unknown; modelName?: unknown };
    return scalarString(parsed.model_name) ?? scalarString(parsed.modelName);
  } catch {
    return null;
  }
}

function toolCallsFromContent(contentJson: string, createdAt: string | null): GooseToolCallEvidence[] {
  let content: unknown;
  try { content = JSON.parse(contentJson); } catch { return []; }
  if (!Array.isArray(content)) return [];
  return content.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = (item as { toolCall?: { value?: { name?: unknown } } }).toolCall?.value;
    return typeof value?.name === "string" ? [{ name: value.name, createdAt }] : [];
  });
}

function delegateCallsFromContent(contentJson: string, createdAt: string | null): GooseDelegateCallEvidence[] {
  let content: unknown;
  try { content = JSON.parse(contentJson); } catch { return []; }
  if (!Array.isArray(content)) return [];
  return content.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = (item as {
      toolCall?: { value?: { name?: unknown; arguments?: unknown } };
    }).toolCall?.value;
    if (typeof value?.name !== "string" || !/(?:^|__)delegate$/.test(value.name)) return [];
    const args = value.arguments && typeof value.arguments === "object" && !Array.isArray(value.arguments)
      ? value.arguments as Record<string, unknown>
      : {};
    return [{
      source: scalarString(args.source),
      async: typeof args.async === "boolean" ? args.async : null,
      createdAt,
    }];
  });
}

function assistantTextFromContent(contentJson: string): string | null {
  let content: unknown;
  try { content = JSON.parse(contentJson); } catch { return null; }
  if (!Array.isArray(content)) return null;
  const text = content.flatMap(item => (
    item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
      ? [(item as { text: string }).text]
      : []
  )).join("\n");
  return text || null;
}

export function finalAssistantHasTerminalMarker(
  session: GooseSessionEvidence | undefined,
  expectedMarker: string,
): boolean {
  const text = session?.finalAssistantMessage?.text;
  if (!text) return false;
  return text.trimEnd().split(/\r?\n/).at(-1)?.trim() === expectedMarker;
}

export function readNewGooseSessions(baseline: QualificationBaseline): GooseSessionEvidence[] {
  const path = baseline.gooseSessionsDatabase;
  if (!existsSync(path)) return [];
  const existing = new Set(baseline.existingGooseSessionIds);
  const database = new Database(path, { readonly: true });
  try {
    const sessions = database.query(`
      SELECT id, name, session_type, parent_session_id, working_dir, created_at, updated_at,
             provider_name, model_config_json
      FROM sessions
      ORDER BY created_at, id
    `).all() as Array<Record<string, unknown>>;
    const messageQuery = database.query(`
      SELECT content_json, datetime(created_timestamp, 'unixepoch') AS created_at
      FROM messages
      WHERE session_id = ? AND role = 'assistant'
      ORDER BY created_timestamp, id
    `);
    return sessions.filter(session => typeof session.id === "string" && !existing.has(session.id)).map(session => {
      const id = String(session.id);
      const messages = messageQuery.all(id) as Array<{ content_json: string; created_at: string | null }>;
      const finalAssistant = messages.at(-1);
      const finalAssistantText = finalAssistant
        ? assistantTextFromContent(finalAssistant.content_json)
        : null;
      return {
        id,
        name: String(session.name ?? ""),
        sessionType: String(session.session_type ?? ""),
        parentSessionId: scalarString(session.parent_session_id),
        workingDirectory: String(session.working_dir ?? ""),
        createdAt: String(session.created_at ?? ""),
        updatedAt: String(session.updated_at ?? ""),
        provider: scalarString(session.provider_name),
        model: parseModel(session.model_config_json),
        toolCalls: messages.flatMap(message => toolCallsFromContent(message.content_json, message.created_at)),
        delegateCalls: messages.flatMap(message => delegateCallsFromContent(message.content_json, message.created_at)),
        finalAssistantMessage: finalAssistantText === null ? null : {
          createdAt: finalAssistant?.created_at ?? null,
          text: finalAssistantText,
        },
      };
    });
  } finally {
    database.close();
  }
}

function processKind(before: number | number[] | null, after: number | number[] | null): ProcessChange["kind"] {
  const normalize = (value: number | number[] | null) => Array.isArray(value) ? value.join(",") : value;
  if (normalize(before) === normalize(after)) return "unchanged";
  const beforeEmpty = before === null || (Array.isArray(before) && before.length === 0);
  const afterEmpty = after === null || (Array.isArray(after) && after.length === 0);
  if (beforeEmpty && !afterEmpty) return "started";
  if (!beforeEmpty && afterEmpty) return "stopped";
  if (typeof before === "number" && typeof after === "number") return "restarted";
  return "changed";
}

export function compareProcesses(before: ProcessSnapshot, after: ProcessSnapshot): ProcessChange[] {
  return (Object.keys(before) as Array<keyof ProcessSnapshot>).map(component => ({
    component,
    before: before[component],
    after: after[component],
    kind: processKind(before[component], after[component]),
  }));
}

function currentProcesses(baseline: QualificationBaseline): ProcessSnapshot {
  const descriptor = existsSync(baseline.browserHelper.descriptorPath)
    ? readJsonObject(baseline.browserHelper.descriptorPath) as SafeBrowserDescriptor
    : {};
  const config = readJsonObject(join(baseline.runtimeHome, "config.json")) as SafeRuntimeConfig;
  const brokerSocketPath = typeof config.brokerSocketPath === "string" ? resolve(config.brokerSocketPath) : null;
  const daemonPid = launchctlPid(DAEMON_LABEL);
  return {
    daemonPid,
    browserHostPid: livePid(descriptor.pid),
    tunnelPid: launchctlPid(TUNNEL_LABEL),
    brokerPid: brokerOwnerPid(brokerSocketPath),
    browserHelperPids: helperPids(baseline.browserHelper.scriptPath, daemonPid),
  };
}

export function analyzeEvidence(options: {
  baseline: QualificationBaseline;
  logDeltas: Record<string, LogDelta>;
  currentProcesses: ProcessSnapshot;
  gooseSessions?: GooseSessionEvidence[];
  runManifest?: QualificationRunManifest | null;
  expectedTraceCount?: number;
  minimumCommonOverlapMs?: number;
  now?: Date;
}): QualificationAnalysis {
  const traces = new Map<string, MutableTrace>();
  const rateLimits: RateLimitEvidence[] = [];
  const evidenceGaps = Object.values(options.logDeltas).flatMap(delta => delta.gap ? [delta.gap] : []);
  for (const [name, delta] of Object.entries(options.logDeltas)) {
    if (name === "launcher") parseLauncherEvidence(delta.text, traces);
    const parsed = parseDaemonEvidence(delta.text, traces, delta.source);
    rateLimits.push(...parsed.rateLimits);
  }
  const finalizedTraces = finalizeTraces(traces);
  const expectedTraceCount = options.expectedTraceCount ?? options.runManifest?.sessions.length ?? DEFAULT_EXPECTED_TRACE_COUNT;
  const minimumCommonOverlapMs = options.minimumCommonOverlapMs ?? MINIMUM_COMMON_OVERLAP_MS;
  const commonOverlap = overlapWindow(finalizedTraces);
  const processChanges = compareProcesses(options.baseline.processes, options.currentProcesses);
  const issues: string[] = [];
  if (finalizedTraces.length !== expectedTraceCount) {
    issues.push(`Expected exactly ${expectedTraceCount} ChatGPT-Web traces, observed ${finalizedTraces.length}`);
  }
  if (commonOverlap.durationMs < minimumCommonOverlapMs) {
    issues.push(
      `Common overlap was ${commonOverlap.durationMs}ms, below the required ${minimumCommonOverlapMs}ms`,
    );
  }
  for (const trace of finalizedTraces) {
    if (!trace.startedAt) issues.push(`Trace ${trace.traceId} has no BrowserHost start evidence`);
    if (!trace.endedAt) issues.push(`Trace ${trace.traceId} has no BrowserHost end evidence`);
    if (!trace.releasedAt) issues.push(`Trace ${trace.traceId} has no BrowserHost release evidence`);
    if (trace.endStatus !== "completed" || trace.releaseStatus !== "ready") {
      issues.push(`Trace ${trace.traceId} did not complete and release ready`);
    }
    if (!trace.toolCalls.some(tool => tool.tool === "shell")) {
      issues.push(`Trace ${trace.traceId} has no Goose Native shell tool-call evidence`);
    }
    if (!trace.surfaceId) issues.push(`Trace ${trace.traceId} has no Electron surface ID evidence`);
    if (!trace.rendererPid) issues.push(`Trace ${trace.traceId} has no Electron renderer PID evidence`);
    if (!trace.lifecycle.some(item => item.status === "active")) {
      issues.push(`Trace ${trace.traceId} has no native active lifecycle evidence`);
    }
    if (trace.browserHostHeartbeats.count === 0) {
      issues.push(`Trace ${trace.traceId} has no BrowserHost turn heartbeat evidence`);
    }
    if (trace.lifecycle.some(item => item.status === "gone" || item.status === "destroyed")) {
      issues.push(`Trace ${trace.traceId} has deterministic native terminal evidence`);
    }
    if (trace.controlLiveness.some(item => (
      item.kind === "native-gone"
      || item.kind === "native-destroyed"
      || item.kind === "indeterminate-terminal"
    ))) {
      issues.push(`Trace ${trace.traceId} has terminal control-liveness evidence`);
    }
  }
  for (const change of processChanges) {
    if (["daemonPid", "browserHostPid", "tunnelPid", "brokerPid"].includes(change.component)
      && change.kind !== "unchanged") {
      issues.push(`${change.component} changed during the qualification interval (${change.kind})`);
    }
    if (change.component === "browserHelperPids"
      && change.kind !== "unchanged"
      && change.kind !== "started") {
      issues.push(`browserHelperPids changed unexpectedly during the qualification interval (${change.kind})`);
    }
  }
  if (rateLimits.length > 0) issues.push(`Observed ${rateLimits.length} rate-limit/429 log event(s)`);
  if (evidenceGaps.length > 0) issues.push(`Evidence has ${evidenceGaps.length} log continuity gap(s)`);
  const manifest = options.runManifest ?? null;
  if (manifest) {
    const gooseSessionsById = new Map((options.gooseSessions ?? []).map(session => [session.id, session]));
    if (manifest.sessions.length !== expectedTraceCount) issues.push("Run manifest does not contain the expected session count");
    if (manifest.launchSpreadMs > 2_000) issues.push(`Session launch spread was ${manifest.launchSpreadMs}ms, above the 2000ms bound`);
    if (!manifest.repositoryStatusUnchanged) issues.push("Repository status changed during the read-only workload");
    for (const session of manifest.sessions) {
      if (!session.sessionId) issues.push(`Runner did not capture the Goose session ID for ${session.role}`);
      if (session.exitCode !== 0) issues.push(`${session.role} Goose process exited with ${session.exitCode ?? "no status"}`);
      const gooseSession = session.sessionId ? gooseSessionsById.get(session.sessionId) : undefined;
      if (session.sessionId && !gooseSession) {
        issues.push(`${session.role} Goose session ${session.sessionId} was not found after the baseline`);
      } else if (gooseSession) {
        if (gooseSession.provider !== session.provider) {
          issues.push(`${session.role} used provider ${gooseSession.provider ?? "unknown"}, expected ${session.provider}`);
        }
        if (gooseSession.model !== session.model) {
          issues.push(`${session.role} used model ${gooseSession.model ?? "unknown"}, expected ${session.model}`);
        }
        if (!gooseSession.toolCalls.some(tool => tool.name === "shell")) {
          issues.push(`${session.role} Goose session has no persisted shell tool call`);
        }
      }
      const persistedMarkerObserved = finalAssistantHasTerminalMarker(
        gooseSession,
        session.terminalMarker,
      );
      if (!persistedMarkerObserved) {
        issues.push(`${session.role} terminal marker was not observed in the final persisted assistant message`);
      } else if (!session.terminalMarkerObserved) {
        issues.push(`${session.role} run manifest did not retain its persisted terminal-marker evidence`);
      }
    }
  }
  const now = options.now ?? new Date();
  return {
    version: CHATGPT_WEB_QUALIFICATION_VERSION,
    kind: "chatgpt-web-qualification-analysis",
    analyzedAtUtc: now.toISOString(),
    analyzedAtLocal: formatLocalIso(now),
    baselineCapturedAt: options.baseline.capturedAtUtc,
    verdict: issues.length === 0 ? "qualified" : "not-qualified",
    expectedTraceCount,
    minimumCommonOverlapMs,
    traces: finalizedTraces,
    gooseSessions: options.gooseSessions ?? [],
    processChanges,
    rateLimits,
    pairwiseOverlap: pairwiseOverlaps(finalizedTraces),
    commonOverlap,
    runManifest: manifest,
    evidenceGaps,
    issues,
  };
}

export function analyzeQualification(options: {
  baseline: QualificationBaseline;
  runManifest?: QualificationRunManifest | null;
  expectedTraceCount?: number;
  minimumCommonOverlapMs?: number;
  now?: Date;
}): QualificationAnalysis {
  const logDeltas = Object.fromEntries(
    Object.entries(options.baseline.logs).map(([name, position]) => [name, readLogDelta(position)]),
  );
  return analyzeEvidence({
    baseline: options.baseline,
    logDeltas,
    currentProcesses: currentProcesses(options.baseline),
    gooseSessions: readNewGooseSessions(options.baseline),
    runManifest: options.runManifest,
    expectedTraceCount: options.expectedTraceCount,
    minimumCommonOverlapMs: options.minimumCommonOverlapMs,
    now: options.now,
  });
}

export function renderQualificationVerdict(analysis: QualificationAnalysis): string {
  const lines = [
    analysis.verdict === "qualified" ? "QUALIFICATION PASS" : "QUALIFICATION NOT QUALIFIED",
    `Traces: ${analysis.traces.length}/${analysis.expectedTraceCount}`,
    `Common overlap: ${analysis.commonOverlap.durationMs}ms (required: ${analysis.minimumCommonOverlapMs}ms)`,
    `Goose sessions: ${analysis.gooseSessions.map(session => session.id).join(",") || "none"}`,
    `429/rate-limit events: ${analysis.rateLimits.length}`,
  ];
  for (const trace of analysis.traces) {
    const lifecycle = trace.lifecycle.map(item => `${item.event}@${item.revision ?? "?"}`).join(",") || "none";
    const control = trace.controlLiveness.map(item => item.kind).join(",") || "none";
    lines.push(
      `- ${trace.traceId}: surface=${trace.surfaceId ?? "unknown"} renderer=${trace.rendererPid ?? "unknown"}`
      + ` heartbeats=${trace.browserHostHeartbeats.count} domReadFailures=${trace.domReadFailures}`
      + ` lifecycle=${lifecycle} control=${control}`
      + ` tools=${trace.toolCalls.map(item => item.tool).join(",") || "none"}`,
    );
  }
  lines.push(`Pairwise overlap: ${analysis.pairwiseOverlap.map(window => (
    `${window.traces.join("+")}=${window.durationMs}ms`
  )).join(", ") || "none"}`);
  const changed = analysis.processChanges.filter(change => change.kind !== "unchanged");
  lines.push(`Process changes: ${changed.length ? changed.map(change => `${change.component}:${change.kind}`).join(", ") : "none"}`);
  if (analysis.issues.length > 0) {
    lines.push("Issues:");
    for (const issue of analysis.issues) lines.push(`- ${issue}`);
  }
  return `${lines.join("\n")}\n`;
}

export function loadBaseline(path: string): QualificationBaseline {
  const baseline = readJsonObject(resolve(path)) as unknown as QualificationBaseline;
  if (baseline.kind !== "chatgpt-web-qualification-baseline" || baseline.version !== CHATGPT_WEB_QUALIFICATION_VERSION) {
    throw new Error(`Unsupported qualification baseline at ${path}`);
  }
  return baseline;
}

export function loadRunManifest(path: string): QualificationRunManifest {
  const manifest = readJsonObject(resolve(path)) as unknown as QualificationRunManifest;
  if (manifest.kind !== "chatgpt-web-three-surface-run" || manifest.version !== CHATGPT_WEB_QUALIFICATION_VERSION) {
    throw new Error(`Unsupported qualification run manifest at ${path}`);
  }
  return manifest;
}

export function assertOutputOutsideRepository(repositoryRoot: string, outputPath: string): void {
  const root = `${resolve(repositoryRoot)}${process.platform === "win32" ? "\\" : "/"}`;
  const output = resolve(outputPath);
  if (output === resolve(repositoryRoot) || output.startsWith(root)) {
    throw new Error(`Qualification output must stay outside the repository: ${output}`);
  }
  if (dirname(output) === resolve(repositoryRoot)) {
    throw new Error(`Qualification output must stay outside the repository: ${output}`);
  }
}
