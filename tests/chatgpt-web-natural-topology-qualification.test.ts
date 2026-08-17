import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  analyzeNaturalTopologyEvidence,
  readNewGooseSessions,
  renderNaturalTopologyVerdict,
  traceIdsBeforeBoundary,
  type NaturalTopologyAnalysis,
  type ProcessSnapshot,
  type QualificationBaseline,
} from "../src/qualification/chatgpt-web-qualification";

const EPOCH = Date.parse("2026-08-13T22:00:00.000Z");

function at(seconds: number): string {
  return new Date(EPOCH + seconds * 1_000).toISOString();
}

const processes: ProcessSnapshot = {
  daemonPid: 101,
  browserHostPid: 102,
  tunnelPid: 103,
  brokerPid: 101,
  browserHelperPids: [104],
};

function makeBaseline(sessionsDbPath: string): QualificationBaseline {
  return {
    version: 1,
    kind: "chatgpt-web-qualification-baseline",
    capturedAtUtc: at(-60),
    capturedAtLocal: "2026-08-13T22:00:00.000+02:00",
    repositoryRoot: "/repo",
    runtimeHome: "/runtime",
    processes,
    browserHelper: {
      descriptorPath: "/runtime/launcher-browser.json",
      executablePath: "/electron",
      scriptPath: "/repo/.launcher-runtime/browser-helper.cjs",
      sha256: "abc",
      bytes: 123,
      modifiedAt: at(-61),
    },
    logs: {},
    gooseSessionsDatabase: sessionsDbPath,
    existingGooseSessionIds: [],
    evidenceBoundaryClean: true,
    evidenceBoundaryNotes: [],
    evidenceBoundaryLiveTraceIds: [],
    evidenceBoundaryReapedTraceIds: [],
  };
}

// --- launcher log fixture -----------------------------------------------------------------

function launcherRecord(atIso: string, event: string, detail: Record<string, unknown>): string {
  return JSON.stringify({ at: atIso, level: "info", event, detail });
}

function lifecycleDetail(traceId: string, surfaceId: string, rendererPid: number) {
  return { traceId, surfaceId, rendererPid, status: "active", event: "created", revision: 0 };
}

interface TraceWindow {
  traceId: string;
  startSec: number;
  endSec: number;
}

function launcherFixture(windows: TraceWindow[], includeLifecycle: boolean): string {
  const lines: string[] = [];
  for (const [index, window] of windows.entries()) {
    const surfaceId = `surface-${index}`;
    const rendererPid = 200 + index;
    const lifecycle = includeLifecycle ? { lifecycle: lifecycleDetail(window.traceId, surfaceId, rendererPid) } : {};
    lines.push(launcherRecord(at(window.startSec), "browser.turn_started", { traceId: window.traceId, ...lifecycle }));
    lines.push(launcherRecord(at(window.startSec + 1), "browser.turn_heartbeat", { traceId: window.traceId, ...lifecycle }));
    lines.push(launcherRecord(at(window.endSec), "browser.tab_released", {
      traceId: window.traceId,
      tabId: `tab-${window.traceId}`,
      status: "ready",
    }));
    lines.push(launcherRecord(at(window.endSec), "browser.turn_ended", { traceId: window.traceId, status: "completed" }));
  }
  return `${lines.join("\n")}\n`;
}

const WIDE_OVERLAP_WINDOWS: TraceWindow[] = [
  { traceId: "trace-parent", startSec: 0, endSec: 700 },
  { traceId: "trace-a", startSec: 5, endSec: 650 },
  { traceId: "trace-b", startSec: 8, endSec: 690 },
];

// --- Goose sessions.db fixture -------------------------------------------------------------

type MessageSpec =
  | { role: "assistant"; kind: "toolRequest"; callId: string; tool: string; arguments?: Record<string, unknown>; at: string }
  | { role: "user"; kind: "toolResponse"; callId: string; text: string; isError?: boolean; at: string }
  | { role: "assistant"; kind: "text"; text: string; at: string };

function toolReq(callId: string, tool: string, args: Record<string, unknown> | undefined, atIso: string): MessageSpec {
  return { role: "assistant", kind: "toolRequest", callId, tool, arguments: args, at: atIso };
}
function toolResp(callId: string, text: string, atIso: string, isError = false): MessageSpec {
  return { role: "user", kind: "toolResponse", callId, text, isError, at: atIso };
}
function textMsg(text: string, atIso: string): MessageSpec {
  return { role: "assistant", kind: "text", text, at: atIso };
}

interface SessionSpec {
  id: string;
  name: string;
  parentSessionId: string | null;
  messages: MessageSpec[];
}

function createSessionsDatabase(root: string, sessions: SessionSpec[]): string {
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
        id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content_json TEXT,
        created_timestamp INTEGER
      );
    `);
    const insertSession = database.prepare(`
      INSERT INTO sessions VALUES (?, ?, 'user', ?, '/repo', ?, ?, ?, ?)
    `);
    const insertMessage = database.prepare(`
      INSERT INTO messages (session_id, role, content_json, created_timestamp) VALUES (?, ?, ?, ?)
    `);
    for (const session of sessions) {
      const first = session.messages[0]?.at ?? at(0);
      const last = session.messages.at(-1)?.at ?? first;
      insertSession.run(
        session.id, session.name, session.parentSessionId, first, last,
        "custom_chatgpt_web__local_1", JSON.stringify({ model_name: "chatgpt-web/medium" }),
      );
      for (const message of session.messages) {
        const contentJson = message.kind === "toolRequest"
          ? JSON.stringify([{
              type: "toolRequest",
              id: message.callId,
              toolCall: { status: "success", value: { name: message.tool, arguments: message.arguments ?? {} } },
            }])
          : message.kind === "toolResponse"
          ? JSON.stringify([{
              type: "toolResponse",
              id: message.callId,
              toolResult: {
                status: "success",
                value: { content: [{ type: "text", text: message.text }], ...(message.isError ? { isError: true } : {}) },
              },
            }])
          : JSON.stringify([{ type: "text", text: message.text }]);
        insertMessage.run(session.id, message.role, contentJson, Math.floor(Date.parse(message.at) / 1_000));
      }
    }
  } finally {
    database.close();
  }
  return path;
}

// --- Parent/child message sequence builders --------------------------------------------------

function validDelegateMessages(options: {
  childASessionId: string;
  childBSessionId: string;
  asyncA?: boolean;
  asyncB?: boolean;
  loadBeforeSecondDelegate?: boolean;
  duplicateChildIds?: boolean;
}): MessageSpec[] {
  const asyncA = options.asyncA ?? true;
  const asyncB = options.asyncB ?? true;
  const bId = options.duplicateChildIds ? options.childASessionId : options.childBSessionId;
  const messages: MessageSpec[] = [
    toolReq("call-delegate-a", "delegate", { source: "chatgpt-web-concurrency-child-a", async: asyncA }, at(0)),
    toolResp("call-delegate-a", `Task ${options.childASessionId} started in background: "chatgpt-web-concurrency-child-a"`, at(1)),
  ];
  if (options.loadBeforeSecondDelegate) {
    messages.push(
      toolReq("call-load-early", "load", { source: options.childASessionId }, at(2)),
      toolResp("call-load-early", `# Background Task Result: ${options.childASessionId}\n**Status:** ✓ Completed\n\nchild-a-ok`, at(3)),
    );
  }
  messages.push(
    toolReq("call-delegate-b", "delegate", { source: "chatgpt-web-concurrency-child-b", async: asyncB }, at(4)),
    toolResp("call-delegate-b", `Task ${bId} started in background: "chatgpt-web-concurrency-child-b"`, at(5)),
    toolReq("call-shell-1", "shell", { command: "pwd" }, at(6)),
    toolResp("call-shell-1", "/repo", at(7)),
  );
  return messages;
}

function loadMessages(childASessionId: string, childBSessionId: string, options: {
  childAOutcomeText: string;
  childBOutcomeText: string;
}): MessageSpec[] {
  return [
    toolReq("call-load-a", "load", { source: childASessionId }, at(100)),
    toolResp("call-load-a", options.childAOutcomeText, at(110)),
    toolReq("call-load-b", "load", { source: childBSessionId }, at(111)),
    toolResp("call-load-b", options.childBOutcomeText, at(120)),
  ];
}

const CHILD_A_ID = "child-a-session";
const CHILD_B_ID = "child-b-session";

function childSession(id: string, marker: string, options: { hasShellEvidence?: boolean; wrongMarker?: boolean } = {}): SessionSpec {
  const hasShellEvidence = options.hasShellEvidence ?? true;
  const messages: MessageSpec[] = [];
  if (hasShellEvidence) {
    messages.push(
      toolReq("call-child-shell", "shell", { command: "pwd" }, at(10)),
      toolResp("call-child-shell", "/repo", at(11)),
    );
  }
  messages.push(textMsg(`Findings complete.\n${options.wrongMarker ? "unexpected-output" : marker}`, at(12)));
  return { id, name: `qualification-${id}`, parentSessionId: "parent-session", messages };
}

function emptyChildSession(id: string): SessionSpec {
  // Mirrors the observed run: the delegate call registered a task id but the child session
  // never persisted a single assistant/tool message before the load call reported a
  // network/stream-decode error.
  return { id, name: `qualification-${id}`, parentSessionId: "parent-session", messages: [] };
}

function analyze(dbPath: string, launcherText: string): NaturalTopologyAnalysis {
  const baseline = makeBaseline(dbPath);
  return analyzeNaturalTopologyEvidence({
    baseline,
    logDeltas: { launcher: { source: "launcher.jsonl", text: launcherText, rotated: false } },
    currentProcesses: processes,
    gooseSessions: readNewGooseSessions(baseline),
  });
}

// --- tests -----------------------------------------------------------------------------------

test("two correct async:true delegates with successful children and parent marker qualify PASS", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-pass-"));
  try {
    const parentMessages = [
      ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
      ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
        childAOutcomeText: `# Background Task Result: ${CHILD_A_ID}\n**Status:** ✓ Completed\n\nchild-a-ok`,
        childBOutcomeText: `# Background Task Result: ${CHILD_B_ID}\n**Status:** ✓ Completed\n\nchild-b-ok`,
      }),
      textMsg("Parent findings complete.\nnatural-parent-ok", at(121)),
    ];
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "chatgpt-web-natural-concurrency", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.verdict).toBe("PASS");
    expect(analysis.components).toEqual({
      topologyFormation: "PASS",
      parentNativeWorkBeforeLoad: "PASS",
      threeWayOverlap: "PASS",
      processStability: "PASS",
      runtimeIntegrity: "PASS",
      childCompletion: "PASS",
      parentMarker: "PASS",
      nativeLifecycleEvidence: "PASS",
    });
    expect(analysis.parentSessionId).toBe("parent-session");
    expect(analysis.bothDelegatesBeforeFirstLoad).toBe(true);
    expect(analysis.children.map(child => child.markerObserved)).toEqual([true, true]);
    expect(analysis.reasons).toEqual([]);
    expect(renderNaturalTopologyVerdict(analysis)).toContain("NATURAL PARENT + 2: PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PASS is still reachable when native lifecycle evidence is absent, but it is reported NOT_ESTABLISHED rather than silently passed", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-no-lifecycle-"));
  try {
    const parentMessages = [
      ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
      ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
        childAOutcomeText: `**Status:** ✓ Completed\n\nchild-a-ok`,
        childBOutcomeText: `**Status:** ✓ Completed\n\nchild-b-ok`,
      }),
      textMsg("Parent findings complete.\nnatural-parent-ok", at(121)),
    ];
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "chatgpt-web-natural-concurrency", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, false));

    expect(analysis.components.nativeLifecycleEvidence).toBe("NOT_ESTABLISHED");
    expect(analysis.verdict).toBe("PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a delegate call that does not persist async:true is INVALID_TOPOLOGY", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-missing-async-"));
  try {
    const parentMessages = validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID, asyncB: false });
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.verdict).toBe("INVALID_TOPOLOGY");
    expect(analysis.components.topologyFormation).toBe("FAIL");
    expect(analysis.reasons).toContainEqual(expect.stringContaining("did not persist async:true"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a load call issued before the second delegate is INVALID_TOPOLOGY", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-load-before-b-"));
  try {
    const parentMessages = validDelegateMessages({
      childASessionId: CHILD_A_ID,
      childBSessionId: CHILD_B_ID,
      loadBeforeSecondDelegate: true,
    });
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.verdict).toBe("INVALID_TOPOLOGY");
    expect(analysis.bothDelegatesBeforeFirstLoad).toBe(false);
    expect(analysis.reasons).toContainEqual(expect.stringContaining("load/peek call before both delegate calls"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two delegate calls resolving to the same child task id (duplicate/replacement child) is INVALID_TOPOLOGY", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-duplicate-child-"));
  try {
    const parentMessages = validDelegateMessages({
      childASessionId: CHILD_A_ID,
      childBSessionId: CHILD_B_ID,
      duplicateChildIds: true,
    });
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.verdict).toBe("INVALID_TOPOLOGY");
    expect(analysis.reasons).toContainEqual(expect.stringContaining("duplicate/replacement child"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a genuinely formed topology where Child A stream-decodes to nothing and Child B succeeds is topology PASS / completion FAIL, not INVALID_TOPOLOGY", () => {
  // Reproduces the actually-observed 2026-08-13 natural run: parent 20260813_45, Child A
  // 20260813_46 (zero persisted assistant messages, load reported a stream-decode error, no
  // tab_completed), Child B 20260813_47 (child-b-ok), parent correctly withheld natural-parent-ok.
  const root = mkdtempSync(join(tmpdir(), "natural-topology-child-a-stream-decode-"));
  try {
    const parentMessages = [
      ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
      ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
        childAOutcomeText: `# Background Task Result: ${CHILD_A_ID}\n**Status:** ✓ Completed\n**Duration:** 10m (1 turns)\n\n`
          + "## Output\n\nNetwork error: Stream decode error: error decoding response body\n\nPlease resend your message to try again.",
        childBOutcomeText: `# Background Task Result: ${CHILD_B_ID}\n**Status:** ✓ Completed\n**Duration:** 21m (19 turns)\n\n`
          + "## Output\n\n- child-b-ok",
      }),
      textMsg(
        "Qualification incomplete: both children were launched asynchronously in the required order and"
          + " parent-side read-only work completed, but Child A's result could not be collected. Child B was"
          + " successfully collected and returned child-b-ok. I cannot truthfully emit natural-parent-ok.",
        at(121),
      ),
    ];
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "chatgpt-web-natural-concurrency", parentSessionId: null, messages: parentMessages },
      emptyChildSession(CHILD_A_ID),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.components.topologyFormation).toBe("PASS");
    expect(analysis.components.childCompletion).toBe("FAIL");
    expect(analysis.components.parentMarker).toBe("FAIL");
    expect(analysis.verdict).toBe("FAIL");
    const childA = analysis.children.find(child => child.expectedRole === "child-a");
    expect(childA?.markerObserved).toBe(false);
    expect(childA?.hasNativeShellEvidence).toBe(false);
    expect(childA?.backgroundErrorText).toContain("Stream decode error");
    const childB = analysis.children.find(child => child.expectedRole === "child-b");
    expect(childB?.markerObserved).toBe(true);
    expect(analysis.parentMarkerObserved).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a child session with shell evidence but the wrong final marker text fails completion distinctly from a session with no evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-wrong-marker-"));
  try {
    const parentMessages = [
      ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
      ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
        childAOutcomeText: `**Status:** ✓ Completed\n\nsee output above`,
        childBOutcomeText: `**Status:** ✓ Completed\n\nchild-b-ok`,
      }),
      textMsg("natural-parent-ok", at(121)),
    ];
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok", { wrongMarker: true }),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.components.topologyFormation).toBe("PASS");
    expect(analysis.components.childCompletion).toBe("FAIL");
    const childA = analysis.children.find(child => child.expectedRole === "child-a");
    expect(childA?.hasNativeShellEvidence).toBe(true);
    expect(childA?.markerObserved).toBe(false);
    expect(childA?.finalAssistantText).toContain("unexpected-output");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("both children succeed but the parent withholds its own marker: parentMarker FAIL in isolation", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-missing-parent-marker-"));
  try {
    const parentMessages = [
      ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
      ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
        childAOutcomeText: `**Status:** ✓ Completed\n\nchild-a-ok`,
        childBOutcomeText: `**Status:** ✓ Completed\n\nchild-b-ok`,
      }),
      textMsg("Parent work complete, but I am withholding the footer pending review.", at(121)),
    ];
    const dbPath = createSessionsDatabase(root, [
      { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
      childSession(CHILD_A_ID, "child-a-ok"),
      childSession(CHILD_B_ID, "child-b-ok"),
    ]);
    const analysis = analyze(dbPath, launcherFixture(WIDE_OVERLAP_WINDOWS, true));

    expect(analysis.components.childCompletion).toBe("PASS");
    expect(analysis.components.parentMarker).toBe("FAIL");
    expect(analysis.verdict).toBe("FAIL");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function exactOverlapFixture(durationMs: number): string {
  const windows: TraceWindow[] = [
    { traceId: "trace-parent", startSec: 0, endSec: durationMs / 1_000 },
    { traceId: "trace-a", startSec: 0, endSec: durationMs / 1_000 },
    { traceId: "trace-b", startSec: 0, endSec: durationMs / 1_000 },
  ];
  return launcherFixture(windows, true);
}

function overlapBoundaryFixtureSessions(root: string): string {
  const parentMessages = [
    ...validDelegateMessages({ childASessionId: CHILD_A_ID, childBSessionId: CHILD_B_ID }),
    ...loadMessages(CHILD_A_ID, CHILD_B_ID, {
      childAOutcomeText: `**Status:** ✓ Completed\n\nchild-a-ok`,
      childBOutcomeText: `**Status:** ✓ Completed\n\nchild-b-ok`,
    }),
    textMsg("natural-parent-ok", at(121)),
  ];
  return createSessionsDatabase(root, [
    { id: "parent-session", name: "parent", parentSessionId: null, messages: parentMessages },
    childSession(CHILD_A_ID, "child-a-ok"),
    childSession(CHILD_B_ID, "child-b-ok"),
  ]);
}

test("9999ms of common three-way overlap does not qualify threeWayOverlap", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-overlap-9999-"));
  try {
    const dbPath = overlapBoundaryFixtureSessions(root);
    const analysis = analyze(dbPath, exactOverlapFixture(9_999));

    expect(analysis.qualification.commonOverlap.durationMs).toBe(9_999);
    expect(analysis.components.threeWayOverlap).toBe("FAIL");
    expect(analysis.verdict).toBe("FAIL");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("10000ms of common three-way overlap qualifies threeWayOverlap at the boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-overlap-10000-"));
  try {
    const dbPath = overlapBoundaryFixtureSessions(root);
    const analysis = analyze(dbPath, exactOverlapFixture(10_000));

    expect(analysis.qualification.commonOverlap.durationMs).toBe(10_000);
    expect(analysis.components.threeWayOverlap).toBe("PASS");
    expect(analysis.verdict).toBe("PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale orphan-reaped traces are not treated as live contention, unlike a genuinely active trace", () => {
  const root = mkdtempSync(join(tmpdir(), "natural-topology-boundary-"));
  const logPath = join(root, "launcher.jsonl");
  try {
    const lines = [
      launcherRecord(at(0), "browser.turn_started", { traceId: "reaped-trace" }),
      launcherRecord(at(1), "browser.turn_heartbeat", { traceId: "reaped-trace" }),
      launcherRecord(at(2), "browser.orphan_turn_reaped", { traceId: "reaped-trace", evidence: "browser_surface_bootstrap_timeout" }),
      launcherRecord(at(3), "browser.turn_started", { traceId: "genuinely-active-trace" }),
      launcherRecord(at(4), "browser.turn_heartbeat", { traceId: "genuinely-active-trace" }),
    ];
    writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");

    const status = traceIdsBeforeBoundary(logPath);
    expect(status.reaped).toEqual(["reaped-trace"]);
    expect(status.active).toEqual(["genuinely-active-trace"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
