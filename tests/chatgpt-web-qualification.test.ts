import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  analyzeEvidence,
  finalAssistantHasTerminalMarker,
  parseDaemonEvidence,
  qualificationRunTiming,
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

function exactCommonOverlapLauncherFixture(durationMs: number): string {
  const lines: string[] = [];
  for (const spec of traceSpecs) {
    lines.push(launcherRecord(at(0), "browser.turn_started", {
      traceId: spec.traceId,
      lifecycle: lifecycle(spec.traceId, spec.surfaceId, spec.rendererPid),
    }));
    lines.push(launcherRecord(at(1), "browser.turn_heartbeat", {
      traceId: spec.traceId,
      lifecycle: lifecycle(spec.traceId, spec.surfaceId, spec.rendererPid),
    }));
    lines.push(launcherRecord(at(durationMs / 1_000), "browser.tab_released", {
      traceId: spec.traceId,
      tabId: `tab-${spec.traceId}`,
      status: "ready",
    }));
    lines.push(launcherRecord(at(durationMs / 1_000), "browser.turn_ended", {
      traceId: spec.traceId,
      status: "completed",
    }));
  }
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
  delegateCalls: [],
  finalAssistantMessage: {
    createdAt: at(spec.end),
    text: `qualification complete\n${index === 0 ? "high-session-ok" : `child-${index === 1 ? "a" : "b"}-ok`}`,
  },
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

test("recoverable indeterminate entry is not terminal but indeterminate-terminal is", () => {
  const analyzeControlKind = (kind: "indeterminate" | "indeterminate-terminal") => analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: { source: "launcher.jsonl", text: completeLauncherFixture(), rotated: false },
      daemonStdout: {
        source: "daemon.stdout.log",
        text: completeDaemonFixture()
          + `[chatgpt-web] browser turn trace-a control-liveness=${kind}`
          + " outstandingMs=76000 sinceHealthyMs=76000 progressing=false"
          + " domReadFailures=2 nativeStatus=active nativeEvent=created"
          + " nativeRevision=0 rendererPid=202 surfaceId=surface-a\n",
        rotated: false,
      },
    },
    currentProcesses: processes,
    gooseSessions,
    runManifest,
  });

  const recoverable = analyzeControlKind("indeterminate");
  expect(recoverable.verdict).toBe("qualified");
  expect(recoverable.traces.find(trace => trace.traceId === "trace-a")?.controlLiveness)
    .toContainEqual(expect.objectContaining({ kind: "indeterminate" }));

  const terminal = analyzeControlKind("indeterminate-terminal");
  expect(terminal.verdict).toBe("not-qualified");
  expect(terminal.issues).toContain("Trace trace-a has terminal control-liveness evidence");
});

test("9999ms of common three-way overlap does not qualify", () => {
  const analysis = analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: {
        source: "launcher.jsonl",
        text: exactCommonOverlapLauncherFixture(9_999),
        rotated: false,
      },
      daemonStdout: { source: "daemon.stdout.log", text: completeDaemonFixture(), rotated: false },
    },
    currentProcesses: processes,
  });

  expect(analysis.commonOverlap.durationMs).toBe(9_999);
  expect(analysis.verdict).toBe("not-qualified");
  expect(analysis.issues).toContain("Common overlap was 9999ms, below the required 10000ms");
});

test("10000ms of common three-way overlap qualifies at the boundary", () => {
  const analysis = analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: {
        source: "launcher.jsonl",
        text: exactCommonOverlapLauncherFixture(10_000),
        rotated: false,
      },
      daemonStdout: { source: "daemon.stdout.log", text: completeDaemonFixture(), rotated: false },
    },
    currentProcesses: processes,
  });

  expect(analysis.commonOverlap.durationMs).toBe(10_000);
  expect(analysis.verdict).toBe("qualified");
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

test("rate-limit evidence recognizes HTTP/status 429 and rejects decimal timings", () => {
  const real = parseDaemonEvidence([
    "HTTP 429 Too Many Requests",
    'provider failed with "status":429',
  ].join("\n"));
  expect(real.rateLimits).toHaveLength(2);

  const timings = parseDaemonEvidence([
    "probe completed in 429.955µs",
    "parser completed in 8.429µs",
  ].join("\n"));
  expect(timings.rateLimits).toEqual([]);
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

function readMarkerSession(messages: Array<{ role: "user" | "assistant"; text: string }>): GooseSessionEvidence {
  const root = mkdtempSync(join(tmpdir(), "chatgpt-web-marker-session-"));
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
    database.prepare(`
      INSERT INTO sessions VALUES (
        'new', 'qualification-child-a', 'user', NULL, '/repo', ?, ?,
        'custom_chatgpt_web__local_1', ?
      )
    `).run(at(0), at(60), JSON.stringify({ model_name: "chatgpt-web/medium" }));
    const insertMessage = database.prepare("INSERT INTO messages VALUES (?, 'new', ?, ?, ?)");
    for (const [index, message] of messages.entries()) {
      insertMessage.run(
        index + 1,
        message.role,
        JSON.stringify([{ type: "text", text: message.text }]),
        index + 1,
      );
    }
  } finally {
    database.close();
  }
  try {
    const sessions = readNewGooseSessions({
      ...baseline,
      gooseSessionsDatabase: path,
      existingGooseSessionIds: [],
    });
    if (!sessions[0]) throw new Error("Synthetic Goose session was not read");
    return sessions[0];
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("terminal marker appearing only in persisted user/prompt content fails", () => {
  const session = readMarkerSession([
    { role: "user", text: "End with child-a-ok" },
    { role: "assistant", text: "I stopped before producing the required marker." },
  ]);
  expect(finalAssistantHasTerminalMarker(session, "child-a-ok")).toBe(false);
});

test("terminal marker in the final persisted assistant message passes", () => {
  const session = readMarkerSession([
    { role: "user", text: "End with child-a-ok" },
    { role: "assistant", text: "Read-only work complete.\nchild-a-ok\n" },
  ]);
  expect(finalAssistantHasTerminalMarker(session, "child-a-ok")).toBe(true);
});

test("wrong marker in the final persisted assistant message fails", () => {
  const session = readMarkerSession([
    { role: "user", text: "End with child-a-ok" },
    { role: "assistant", text: "Read-only work complete.\nchild-b-ok" },
  ]);
  expect(finalAssistantHasTerminalMarker(session, "child-a-ok")).toBe(false);
});

test("analyzer does not trust a manifest marker when persisted final assistant evidence disagrees", () => {
  const sessions = gooseSessions.map(session => session.id === "session-1"
    ? {
        ...session,
        finalAssistantMessage: { createdAt: at(61), text: "The prompt mentioned child-a-ok only." },
      }
    : session);
  const analysis = analyzeEvidence({
    baseline,
    logDeltas: {
      launcher: { source: "launcher.jsonl", text: completeLauncherFixture(), rotated: false },
      daemonStdout: { source: "daemon.stdout.log", text: completeDaemonFixture(), rotated: false },
    },
    currentProcesses: processes,
    gooseSessions: sessions,
    runManifest,
  });
  expect(analysis.verdict).toBe("not-qualified");
  expect(analysis.issues).toContain(
    "child-a terminal marker was not observed in the final persisted assistant message",
  );
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
    database.prepare("INSERT INTO messages VALUES (?, ?, 'assistant', ?, ?)").run(
      2,
      "new",
      JSON.stringify([{
        toolCall: {
          value: {
            name: "delegate",
            arguments: { source: "chatgpt-web-concurrency-child-a", async: true },
          },
        },
      }]),
      Math.floor(Date.parse(at(8)) / 1_000),
    );
    database.prepare("INSERT INTO messages VALUES (?, ?, 'assistant', ?, ?)").run(
      3,
      "new",
      JSON.stringify([{ type: "text", text: "complete\nchild-a-ok" }]),
      Math.floor(Date.parse(at(10)) / 1_000),
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
      toolCalls: [
        { name: "shell", createdAt: "2026-08-13 18:01:05" },
        { name: "delegate", createdAt: "2026-08-13 18:01:08" },
      ],
      delegateCalls: [{
        source: "chatgpt-web-concurrency-child-a",
        async: true,
        createdAt: "2026-08-13 18:01:08",
      }],
      finalAssistantMessage: {
        createdAt: "2026-08-13 18:01:10",
        text: "complete\nchild-a-ok",
      },
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

test("empty runner timing preserves the baseline fallback instead of evaluating an empty minimum", () => {
  expect(qualificationRunTiming([], baseline.capturedAtUtc)).toEqual({
    launchedAt: baseline.capturedAtUtc,
    launchSpreadMs: 0,
  });
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
  expect(runner).toContain("finalAssistantHasTerminalMarker(");
  expect(runner).not.toContain("includes(item.session.terminalMarker)");
  expect(runner).not.toMatch(/connectOverCDP|playwright|chrome-remote-interface/i);
  expect(runner).not.toMatch(/launchctl\s+(?:kickstart|start|stop)|runtime-lifecycle/i);

  const monitor = readFileSync(
    join(repositoryRoot, "src", "qualification", "chatgpt-web-qualification.ts"),
    "utf8",
  );
  expect(monitor).not.toMatch(/connectOverCDP|playwright|chrome-remote-interface/i);
});
