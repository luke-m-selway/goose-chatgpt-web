import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  ChatGptFlightRecorder,
  configureChatGptFlightRecorder,
  resolveFlightRecorderConfig,
  sanitizeFlightEvent,
  summarizeFlightEvents,
} from "../src/observations/flight-recorder";
import { AsyncEventQueue } from "../src/event-queue";
import { bridgeToResponsesSSE } from "../src/bridge";
import type { AdapterEvent } from "../src/types";
import { HttpTurnCounter, registerResponseTransportObservation } from "../src/server";
import { reportChatGptBrowserEvidence } from "../src/adapters/chatgpt-web/browser-worker";

const roots: string[] = [];
afterEach(() => {
  configureChatGptFlightRecorder({ enabled: false });
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), "chatgpt-flight-recorder-"));
  roots.push(directory);
  return directory;
}

function event(timestamp: string, category: string, name: string, detail: Record<string, unknown> = {}) {
  return { version: 1, timestamp, category, event: name, traceId: "trace_600s", ...detail };
}

test("completed Responses lifecycle records terminal, DONE, and normal body close", async () => {
  const directory = root();
  const recorder = new ChatGptFlightRecorder(resolveFlightRecorderConfig({ enabled: true, rootDir: directory }));
  const traceId = "trace_completed";
  const at = (offset: number) => new Date(Date.UTC(2026, 7, 14, 10, 0, 0) + offset).toISOString();
  recorder.record({ category: "request", event: "request-accepted", traceId, requestId: "request-1", timestamp: at(0), stream: true });
  recorder.record({ category: "responses", event: "first-sse-frame", traceId, requestId: "request-1", timestamp: at(4) });
  recorder.record({ category: "responses", event: "response.completed", traceId, requestId: "request-1", timestamp: at(20) });
  recorder.record({ category: "responses", event: "done-enqueued", traceId, requestId: "request-1", timestamp: at(21) });
  recorder.record({ category: "responses", event: "body-normal-close", traceId, requestId: "request-1", timestamp: at(22) });
  await recorder.flush();

  const lines = readFileSync(join(directory, "2026-08-14", traceId, "events.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(lines.map(line => line.event)).toEqual([
    "request-accepted", "first-sse-frame", "response.completed", "done-enqueued", "body-normal-close",
  ]);
  const summary = JSON.parse(readFileSync(join(directory, "2026-08-14", traceId, "summary.json"), "utf8"));
  expect(summary.responsesTransportOutcome).toBe("body-normal-close");
});

test("SSE bridge reports first frame, terminal response, and DONE without observing text deltas", async () => {
  const queue = new AsyncEventQueue<AdapterEvent>();
  queue.push({ type: "text_delta", text: "private answer", phase: "final_answer" });
  queue.push({ type: "done", stopReason: "stop", endTurn: true });
  queue.close();
  const observed: string[] = [];
  const stream = bridgeToResponsesSSE(queue, "model", undefined, undefined, undefined, undefined, 2_000, {
    onFirstFrame: () => observed.push("first"),
    onTerminal: status => observed.push(status),
    onDone: () => observed.push("done"),
  });
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
  expect(observed).toEqual(["first", "completed", "done"]);
});

test("submission poll windows persist only compact per-iteration timing metadata", async () => {
  const directory = root();
  const recorder = configureChatGptFlightRecorder({ enabled: true, rootDir: directory });
  reportChatGptBrowserEvidence({
    event: "submission-poll-window",
    traceId: "trace_poll_window",
    cadenceMs: 50,
    samples: [{
      iteration: 1,
      startGapMs: null,
      pollDelayMs: null,
      readMs: 17,
      sessionAlertReadMs: 2,
      rateLimitReadMs: 3,
      countsReadMs: 9,
      generationReadMs: 3,
      completed: true,
      userTurnCount: 1,
      assistantTurnCount: 1,
      generationRunning: true,
      visibleText: "private page text",
    }],
  });
  await recorder.flush();
  const events = readFileSync(
    join(directory, new Date().toISOString().slice(0, 10), "trace_poll_window", "events.jsonl"),
    "utf8",
  ).trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(item => item.event)).toEqual(["submission-poll-window", "submission-poll-sample"]);
  expect(events[1]).toMatchObject({ iteration: 1, readMs: 17, countsReadMs: 9, generationRunning: true });
  expect(JSON.stringify(events)).not.toContain("private page text");
});

test("outer body cancellation is recorded before a later browser outcome", async () => {
  const directory = root();
  const recorder = configureChatGptFlightRecorder({ enabled: true, rootDir: directory });
  const startedAt = Date.now();
  const counter = new HttpTurnCounter();
  const response = await counter.track(async () => registerResponseTransportObservation(
    new Response(new ReadableStream<Uint8Array>({ cancel() {} })),
    { traceId: "trace_cancelled", requestId: "request-cancelled", startedAt },
  ), undefined, "darwin");
  await response.body!.cancel("client disconnected");
  recorder.record({
    category: "browser", event: "browser-attempt-ended", traceId: "trace_cancelled", outcome: "aborted",
  });
  await recorder.flush();
  const events = readFileSync(
    join(directory, new Date().toISOString().slice(0, 10), "trace_cancelled", "events.jsonl"),
    "utf8",
  ).trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(item => item.event)).toEqual(["client-cancellation", "browser-attempt-ended"]);
});

test("request signal abort records outer client cancellation", async () => {
  const directory = root();
  const recorder = configureChatGptFlightRecorder({ enabled: true, rootDir: directory });
  const abort = new AbortController();
  const counter = new HttpTurnCounter();
  const response = await counter.track(async () => registerResponseTransportObservation(
    new Response(new ReadableStream<Uint8Array>({ cancel() {} })),
    { traceId: "trace_signal_abort", requestId: "request-signal-abort", startedAt: Date.now() },
  ), abort.signal, "darwin");
  abort.abort("client disconnected");
  await new Promise(resolve => setTimeout(resolve, 0));
  await recorder.flush();
  expect(counter.count()).toBe(0);
  const events = readFileSync(
    join(directory, new Date().toISOString().slice(0, 10), "trace_signal_abort", "events.jsonl"),
    "utf8",
  ).trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(item => item.event)).toEqual(["client-cancellation"]);
  await response.body?.cancel().catch(() => {});
});

test("a browser outcome can precede an independently observed outer body failure", async () => {
  const directory = root();
  const recorder = configureChatGptFlightRecorder({ enabled: true, rootDir: directory });
  recorder.record({
    category: "browser", event: "browser-attempt-ended", traceId: "trace_body_error", outcome: "completed",
  });
  const counter = new HttpTurnCounter();
  const response = await counter.track(async () => registerResponseTransportObservation(
    new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error("synthetic outer transport failure")); },
    })),
    { traceId: "trace_body_error", requestId: "request-body-error", startedAt: Date.now() },
  ), undefined, "darwin");
  await expect(response.body!.getReader().read()).rejects.toThrow("synthetic outer transport failure");
  await recorder.flush();
  const events = readFileSync(
    join(directory, new Date().toISOString().slice(0, 10), "trace_body_error", "events.jsonl"),
    "utf8",
  ).trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(item => item.event)).toEqual(["browser-attempt-ended", "body-error"]);
  const summary = JSON.parse(readFileSync(
    join(directory, new Date().toISOString().slice(0, 10), "trace_body_error", "summary.json"),
    "utf8",
  ));
  expect(summary.responsesTransportOutcome).toBe("body-error");
});

test("ordering and six-hundred-second durations are represented without a special timeout assumption", () => {
  const start = "2026-08-14T10:00:00.000Z";
  const cancelledBeforeBrowser = summarizeFlightEvents([
    event(start, "request", "request-accepted"),
    event("2026-08-14T10:10:03.000Z", "responses", "request-signal-abort"),
    event("2026-08-14T10:10:03.100Z", "browser", "browser-attempt-ended", { outcome: "aborted" }),
  ]);
  expect(cancelledBeforeBrowser.durationMs).toBe(603_100);
  expect(cancelledBeforeBrowser.responsesTransportOutcome).toBe("request-signal-abort");

  const browserBeforeBody = summarizeFlightEvents([
    event(start, "request", "request-accepted"),
    event("2026-08-14T10:10:05.000Z", "browser", "browser-attempt-ended", { outcome: "completed" }),
    event("2026-08-14T10:10:06.000Z", "responses", "body-error"),
  ]);
  expect(browserBeforeBody.durationMs).toBe(605_000);
  expect(browserBeforeBody.responsesTransportOutcome).toBe("body-error");
});

test("broker incompletion, retry replacement, and transient UI state remain queryable", () => {
  const summary = summarizeFlightEvents([
    event("2026-08-14T10:00:00.000Z", "browser", "browser-attempt-started", { activeBrowserTurns: 2 }),
    event("2026-08-14T10:00:01.000Z", "broker", "broker-queued", { callId: "call-1", toolName: "shell" }),
    event("2026-08-14T10:00:02.000Z", "broker", "broker-delivered", { callId: "call-1", toolName: "shell" }),
    event("2026-08-14T10:00:03.000Z", "retry", "retry-reserved", { attempt: 2, lineageId: "lineage", previousTraceId: "old-trace" }),
    event("2026-08-14T10:00:04.000Z", "retry", "retry-replacement-linked", { replacementTraceId: "new-trace" }),
    event("2026-08-14T10:00:05.000Z", "browser", "chatgpt-transient-connection-interrupted"),
  ]);
  expect(summary).toMatchObject({
    brokerToolCallCount: 1,
    unresolvedBrokerCallCount: 1,
    retryCount: 1,
    replacementTraceId: "new-trace",
    transientConnectionInterrupted: true,
    maximumActiveBrowserTurns: 2,
  });
});

test("an unusual process restart inside an attempt is reflected in its compact summary", () => {
  const summary = summarizeFlightEvents([
    event("2026-08-14T10:00:00.000Z", "browser", "browser-attempt-started"),
    { version: 1, timestamp: "2026-08-14T10:00:10.000Z", category: "process", event: "restart-requested", role: "secure-mcp-tunnel" },
    event("2026-08-14T10:00:20.000Z", "browser", "browser-attempt-ended", { outcome: "failed" }),
  ]);
  expect(summary.abnormalProcessEvent).toBeTrue();
});

test("structured telemetry drops prompt, answer, tool arguments, and tool-result bodies", () => {
  const safe = sanitizeFlightEvent({
    category: "broker",
    event: "broker-queued",
    traceId: "trace_privacy",
    callId: "call-1",
    toolName: "shell",
    prompt: "secret prompt",
    answerBody: "secret answer",
    toolArguments: "secret args",
    toolResultBody: "secret result",
    message: "secret error body",
    visibleText: "secret visible answer",
  } as never);
  expect(safe).toMatchObject({ callId: "call-1", toolName: "shell" });
  expect(JSON.stringify(safe)).not.toContain("secret");
});
