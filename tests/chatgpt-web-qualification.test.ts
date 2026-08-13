import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  analyzeEvidence,
  readLogDelta,
  readNewGooseSessions,
  renderQualificationVerdict,
  type GooseSessionEvidence,
  type LogPosition,
  type ProcessSnapshot,
  type QualificationBaseline,
  type QualificationRunManifest,
} from "../src/qualification/chatgpt-web-qualification";

const repositoryRoot = join(import.meta.dir, "..");

const processes: ProcessSnapshot = {
  daemonPid: 101,
  browserHostPid: 102,
  tunnelPid: 103,
  brokerPid: 101,
  browserHelperPids: [104],
};

const baseline: QualificationBaseline = {
  version: 1,
  kind: "chatgpt-web-qualification-baseline",
  capturedAtUtc: "2026-08-13T18:00:00.000Z",
  capturedAtLocal: "2026-08-13T20:00:00.000+02:00",
  repositoryRoot: "/repo",
  runtimeHome: "/runtime",
  processes,
  browserHelper: {
    descriptorPath: "/runtime/launcher-browser.json",
    executablePath: "/electron",
    scriptPath: "/repo/.launcher-runtime/browser-helper.cjs",
    sha256: "abc",
    bytes: 123,
    modifiedAt: "2026-08-13T17:59:00.000Z",
  },
  logs: {},
  gooseSessionsDatabase: "/goose/sessions.db",
  existingGooseSessionIds: ["old"],
  evidenceBoundaryClean: true,
  evidenceBoundaryNotes: [],
};

function launcherRecord(at: string, event: string, detail: Record<string, unknown>): string {
  return JSON.stringify({ at, level: "info", event, detail });
}

function lifecycle(traceId: string, surfaceId: string, rendererPid: number, status = "active", event = "created", revision = 0) {
  return { traceId, surfaceId, rendererPid, status, event, revision };
}

const traceSpecs = [
  { traceId: "trace-high", surfaceId: "surface-high", rendererPid: 201, start: 0, end: 60 },
  { traceId: "trace-a", surfaceId: "surface-a", rendererPid: 202, start: 1, end: 61 },
  { traceId: "trace-b", surfaceId: "surface-b", rendererPid: 203, start: 2, end: 62 },
];

function at(seconds: number): string {
  return new Date(Date.parse("2026-08-13T18:01:00.000Z") + seconds * 1_000).toISOString();
}

function completeLauncherFixture(): string {
  const lines: string[] = [];
  for (const spec of traceSpecs) {
    lines.push(launcherRecord(at(spec.start), "browser.turn_started", {
      traceId: spec.traceId,
      lifecycle: lifecycle(spec.traceId, spec.surfaceId, spec.rendererPid),
    }));
    lines.push(launcherRecord(at(spec.start + 10), "browser.turn_heartbeat", {
      traceId: spec.traceId,
      lifecycle: lifecycle(spec.traceId, spec.surfaceId, spec.rendererPid),
    }));
    lines.push(launcherRecord(at(spec.start + 20), "browser.turn_heartbeat", {
      traceId: spec.traceId,
      lifecycle: lifecycle(spec.traceId, spec.surfaceId, spec.rendererPid),
    }));
    lines.push(launcherRecord(at(spec.end), "browser.tab_released", {
      traceId: spec.traceId,
      tabId: `tab-${spec.traceId}`,
      status: "ready",
    }));
    lines.push(launcherRecord(at(spec.end), "browser.turn_ended", {
      traceId: spec.traceId,
      status: "completed",
    }));
  }
  lines.push(launcherRecord(at(12), "browser.tab_renderer_unresponsive", {
    traceId: "trace-a",
    surfaceId: "surface-a",
    rendererPid: 202,
    lifecycleRevision: 1,
  }));
  lines.push(launcherRecord(at(14), "browser.tab_renderer_responsive", {
    traceId: "trace-a",
    surfaceId: "surface-a",
    rendererPid: 202,
    lifecycleRevision: 2,
  }));
  return `${lines.join("\n")}\n`;
}

function completeDaemonFixture(): string {
  const lines = traceSpecs.flatMap(spec => [
    `[chatgpt-web] broker trace=${spec.traceId} queued call=call-${spec.traceId} tool=shell waiters=1`,
    `[chatgpt-web] browser turn ${spec.traceId} dom-read-summary failures=${spec.traceId === "trace-a" ? 2 : 0}`,
  ]);
  lines.push(
    "[chatgpt-web] browser turn trace-a control-liveness=slow outstandingMs=5200 sinceHealthyMs=15000 progressing=false domReadFailures=2 nativeStatus=unresponsive nativeEvent=unresponsive nativeRevision=1 rendererPid=202 surfaceId=surface-a",
    "[chatgpt-web] browser turn trace-a control-liveness=recovered outstandingMs=6500 sinceHealthyMs=16500 progressing=false domReadFailures=2 nativeStatus=active nativeEvent=responsive nativeRevision=2 rendererPid=202 surfaceId=surface-a",
  );
  return `${lines.join("\n")}\n`;
}

const gooseSessions: GooseSessionEvidence[] = traceSpecs.map((spec, index) => ({
  id: `session-${index}`,
  name: `qualification-${spec.traceId}`,
  sessionType: "user",
  parentSessionId: null,
  workingDirectory: "/repo",
  createdAt: at(spec.start),
  updatedAt: at(spec.end),
  provider: "custom_chatgpt_web__local_1",
  model: index === 0 ? "chatgpt-web/high" : "chatgpt-web/medium",
  toolCalls: [{ name: "shell", createdAt: at(spec.start + 5) }],
}));

const runManifest: QualificationRunManifest = {
  version: 1,
  kind: "chatgpt-web-three-surface-run",
  runId: "fixture",
  repositoryRoot: "/repo",
  runtimeHome: "/runtime",
  baselinePath: "/runtime/baseline.json",
  launchedAt: at(0),
  completedAt: at(62),
  launchSpreadMs: 30,
  repositoryStatusUnchanged: true,
  sessions: [
    ["high", "chatgpt-web/high", "high-session-ok"],
    ["child-a", "chatgpt-web/medium", "child-a-ok"],
    ["child-b", "chatgpt-web/medium", "child-b-ok"],
  ].map(([role, model, terminalMarker], index) => ({
    role: role as "high" | "child-a" | "child-b",
    name: `qualification-${role}`,
    sessionId: `session-${index}`,
    provider: "custom_chatgpt_web__local_1",
    model,
    launchedAt: at(index / 100),
    completedAt: at(60 + index),
    exitCode: 0,
    terminalMarker,
    terminalMarkerObserved: true,
    stdoutPath: `/runtime/${role}.stdout.jsonl`,
    stderrPath: `/runtime/${role}.stderr.log`,
  })),
};

test("qualification analyzer deterministically proves three overlapping ordinary Goose traces", () => {
  const analysis = analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: { source: "launcher.jsonl", text: completeLauncherFixture(), rotated: false },
      daemonStdout: { source: "daemon.stdout.log", text: completeDaemonFixture(), rotated: false },
    },
    currentProcesses: processes,
    gooseSessions,
    runManifest,
    expectedTraceCount: 3,
    now: new Date("2026-08-13T18:03:00.000Z"),
  });

  expect(analysis.verdict).toBe("qualified");
  expect(analysis.issues).toEqual([]);
  expect(analysis.traces).toHaveLength(3);
  expect(analysis.commonOverlap.durationMs).toBe(58_000);
  expect(analysis.pairwiseOverlap.every(window => window.durationMs > 0)).toBe(true);
  expect(analysis.traces.find(trace => trace.traceId === "trace-a")).toMatchObject({
    surfaceId: "surface-a",
    rendererPid: 202,
    domReadFailures: 2,
    browserHostHeartbeats: { count: 2, maxGapMs: 10_000 },
    lifecycle: [
      { status: "active", event: "created", revision: 0 },
      { status: "unresponsive", event: "unresponsive", revision: 1 },
      { status: "active", event: "responsive", revision: 2 },
    ],
    controlLiveness: [
      { kind: "slow", nativeRevision: 1 },
      { kind: "recovered", nativeRevision: 2 },
    ],
    toolCalls: [{ tool: "shell" }],
  });
  expect(renderQualificationVerdict(analysis)).toContain("QUALIFICATION PASS");
});

test("qualification analyzer reports missing topology, native death, process restart, and 429 evidence", () => {
  const launcher = completeLauncherFixture()
    .split(/\r?\n/)
    .filter(line => !line.includes("trace-b"))
    .concat(launcherRecord(at(30), "browser.tab_renderer_gone", {
      traceId: "trace-a",
      surfaceId: "surface-a",
      rendererPid: 202,
      lifecycleRevision: 3,
      reason: "crashed",
    }))
    .join("\n");
  const analysis = analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: { source: "launcher.jsonl", text: launcher, rotated: false },
      daemonStdout: {
        source: "daemon.stdout.log",
        text: completeDaemonFixture().replace(/.*trace-b.*\n/g, "") + "HTTP 429 too many requests\n",
        rotated: false,
      },
    },
    currentProcesses: { ...processes, daemonPid: 999 },
    gooseSessions: gooseSessions.slice(0, 2),
    expectedTraceCount: 3,
  });

  expect(analysis.verdict).toBe("not-qualified");
  expect(analysis.rateLimits).toHaveLength(1);
  expect(analysis.issues).toEqual(expect.arrayContaining([
    expect.stringContaining("Expected exactly 3"),
    expect.stringContaining("deterministic native terminal"),
    expect.stringContaining("daemonPid changed"),
    expect.stringContaining("rate-limit/429"),
  ]));
});

test("log delta reader follows the baseline inode through one rotation", () => {
  const root = mkdtempSync(join(tmpdir(), "chatgpt-web-qualification-"));
  const path = join(root, "launcher.jsonl");
  try {
    writeFileSync(path, "before\n", "utf8");
    const native = statSync(path);
    const position: LogPosition = {
      path,
      offset: 7,
      device: Number(native.dev),
      inode: Number(native.ino),
      modifiedAt: native.mtime.toISOString(),
    };
    renameSync(path, `${path}.1`);
    writeFileSync(`${path}.1`, "before\nold-delta\n", "utf8");
    writeFileSync(path, "new-delta\n", "utf8");

    expect(readLogDelta(position)).toEqual({
      source: path,
      text: "old-delta\nnew-delta\n",
      rotated: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a log first created after baseline is complete post-boundary evidence, not a gap", () => {
  const root = mkdtempSync(join(tmpdir(), "chatgpt-web-new-log-"));
  const path = join(root, "daemon.stderr.log");
  try {
    const position: LogPosition = {
      path,
      offset: 0,
      device: null,
      inode: null,
      modifiedAt: null,
    };
    writeFileSync(path, "post-baseline\n", "utf8");
    expect(readLogDelta(position)).toEqual({
      source: path,
      text: "post-baseline\n",
      rotated: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("new Goose sessions preserve provider, model, parent, and persisted tool-call evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "chatgpt-web-goose-sessions-"));
  const path = join(root, "sessions.db");
  const database = new Database(path, { create: true });
  try {
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, name TEXT, session_type TEXT, parent_session_id TEXT,
        working_dir TEXT, created_at TEXT, updated_at TEXT, provider_name TEXT,
        model_config_json TEXT
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content_json TEXT,
        created_timestamp INTEGER
      );
    `);
    const insertSession = database.prepare(`
      INSERT INTO sessions VALUES (?, ?, 'user', ?, '/repo', ?, ?, ?, ?)
    `);
    insertSession.run(
      "old", "old", null, at(-60), at(-50),
      "custom_chatgpt_web__local_1", JSON.stringify({ model_name: "chatgpt-web/medium" }),
    );
    insertSession.run(
      "new", "qualification-child-a", "parent", at(0), at(60),
      "custom_chatgpt_web__local_1", JSON.stringify({ model_name: "chatgpt-web/medium" }),
    );
    database.prepare("INSERT INTO messages VALUES (?, ?, 'assistant', ?, ?)").run(
      1,
      "new",
      JSON.stringify([{ toolCall: { value: { name: "shell" } } }]),
      Math.floor(Date.parse(at(5)) / 1_000),
    );
  } finally {
    database.close();
  }
  try {
    expect(readNewGooseSessions({
      ...baseline,
      gooseSessionsDatabase: path,
      existingGooseSessionIds: ["old"],
    })).toEqual([{
      id: "new",
      name: "qualification-child-a",
      sessionType: "user",
      parentSessionId: "parent",
      workingDirectory: "/repo",
      createdAt: at(0),
      updatedAt: at(60),
      provider: "custom_chatgpt_web__local_1",
      model: "chatgpt-web/medium",
      toolCalls: [{ name: "shell", createdAt: "2026-08-13 18:01:05" }],
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed child recipes pin identity and inherit tools while async remains invocation-only", () => {
  for (const [name, marker] of [
    ["chatgpt-web-concurrency-child-a", "child-a-ok"],
    ["chatgpt-web-concurrency-child-b", "child-b-ok"],
  ]) {
    const recipe = readFileSync(join(repositoryRoot, ".agents", "recipes", `${name}.yaml`), "utf8");
    expect(recipe).toContain("goose_provider: custom_chatgpt_web__local_1");
    expect(recipe).toContain("goose_model: chatgpt-web/medium");
    expect(recipe).toContain(marker);
    expect(recipe).not.toMatch(/^extensions:/m);
    expect(recipe).not.toMatch(/^\s*async:/m);
  }
  const parent = readFileSync(join(repositoryRoot, "qualification", "chatgpt-web-natural-parent.md"), "utf8");
  expect(parent).toContain('delegate(source: "chatgpt-web-concurrency-child-a", async: true)');
  expect(parent).toContain('delegate(source: "chatgpt-web-concurrency-child-b", async: true)');
});

test("three-surface runner uses ordinary Goose recipes without CDP or runtime lifecycle control", () => {
  const runner = readFileSync(
    join(repositoryRoot, "scripts", "run-chatgpt-web-three-surface-qualification.ts"),
    "utf8",
  );
  expect(runner.match(/role: "(?:high|child-a|child-b)"/g)).toHaveLength(3);
  expect(runner).toContain('spawn("goose", [');
  expect(runner).toContain('"run",');
  expect(runner).toContain('"--recipe", workload.recipe');
  expect(runner).not.toMatch(/connectOverCDP|playwright|chrome-remote-interface/i);
  expect(runner).not.toMatch(/launchctl\s+(?:kickstart|start|stop)|runtime-lifecycle/i);

  const monitor = readFileSync(
    join(repositoryRoot, "src", "qualification", "chatgpt-web-qualification.ts"),
    "utf8",
  );
  expect(monitor).not.toMatch(/connectOverCDP|playwright|chrome-remote-interface/i);
});
