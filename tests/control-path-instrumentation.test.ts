import { expect, test } from "bun:test";
import type { Page } from "playwright-core";
import {
  ChatGptBrowserWorker,
  CHATGPT_SUBMISSION_POLL_INTERVAL_MS,
  getUnresolvedChatGptBrowserDiagnosticActionCount,
  reportChatGptBrowserEvidence,
  runChatGptBrowserDiagnosticAction,
  type ChatGptBrowserEvidence,
} from "../src/adapters/chatgpt-web/browser-worker";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function evidenceFromLogs(logs: string[]): ChatGptBrowserEvidence[] {
  const prefix = "[chatgpt-web] evidence ";
  return logs
    .filter(line => line.startsWith(prefix))
    .map(line => JSON.parse(line.slice(prefix.length)) as ChatGptBrowserEvidence);
}

async function captureStageEvidence<T>(action: (logs: string[]) => Promise<T>): Promise<T> {
  const originalInfo = console.info;
  const originalError = console.error;
  const logs: string[] = [];
  console.info = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    return await action(logs);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}

const runStage = (ChatGptBrowserWorker.prototype as unknown as {
  runStage<T>(
    traceId: string,
    stage: string,
    timeoutMs: number,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T>;
}).runStage;

test("a normally completed stage emits no false late-settlement evidence", async () => {
  await captureStageEvidence(async logs => {
    await expect(runStage.call({}, "trace_normal", "send", 50, async () => "ok")).resolves.toBe("ok");
    await nextTask();
    expect(evidenceFromLogs(logs).filter(event => event.event === "stage-action-late-settlement")).toEqual([]);
  });
});

test("a timed-out stage records a later resolve with its trace, stage, and timeout point", async () => {
  await captureStageEvidence(async logs => {
    const action = deferred<string>();
    const raced = runStage.call({}, "trace_late_resolve", "send", 5, () => action.promise);
    await expect(raced).rejects.toThrow("ChatGPT browser stage timed out: send");
    action.resolve("late");
    await nextTask();

    const events = evidenceFromLogs(logs);
    expect(events).toContainEqual(expect.objectContaining({
      event: "stage-action-timeout",
      traceId: "trace_late_resolve",
      stage: "send",
      timeoutMs: 5,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: "stage-action-late-settlement",
      traceId: "trace_late_resolve",
      stage: "send",
      timeoutMs: 5,
      outcome: "resolve",
    }));
  });
});

test("a timed-out stage records a later reject without an unhandled rejection", async () => {
  await captureStageEvidence(async logs => {
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => { unhandled.push(error); };
    process.on("unhandledRejection", onUnhandled);
    try {
      const action = deferred<string>();
      const raced = runStage.call({}, "trace_late_reject", "send", 5, () => action.promise);
      await expect(raced).rejects.toThrow("ChatGPT browser stage timed out: send");
      action.reject(new Error("late stage rejection"));
      await nextTask();
      await nextTask();

      expect(unhandled).toEqual([]);
      expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
        event: "stage-action-late-settlement",
        traceId: "trace_late_reject",
        stage: "send",
        outcome: "reject",
      }));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

test("diagnostic action completion increments then decrements outstanding without false late evidence", async () => {
  const events: ChatGptBrowserEvidence[] = [];
  const baseline = getUnresolvedChatGptBrowserDiagnosticActionCount();
  await expect(runChatGptBrowserDiagnosticAction(
    async () => "captured",
    {
      traceId: "trace_diag_normal",
      checkpoint: "composer-ready",
      actionId: "01-composer-ready",
      timeoutMs: 50,
      report: event => events.push(event),
    },
  )).resolves.toBe("captured");

  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-start",
    outstanding: baseline + 1,
  }));
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-complete",
    outcome: "resolve",
    outstanding: baseline,
  }));
  expect(events.some(event => event.event === "diagnostic-action-late-settlement")).toBeFalse();
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount()).toBe(baseline);
});

test("concurrent timed-out diagnostics retain trace/checkpoint identity and decrement on late settlement", async () => {
  const events: ChatGptBrowserEvidence[] = [];
  const baseline = getUnresolvedChatGptBrowserDiagnosticActionCount();
  const first = deferred<string>();
  const second = deferred<string>();
  const runDiagnostic = (
    action: ReturnType<typeof deferred<string>>,
    traceId: string,
    checkpoint: string,
  ) => runChatGptBrowserDiagnosticAction(
    () => action.promise,
    {
      traceId,
      checkpoint,
      actionId: `01-${checkpoint}`,
      timeoutMs: 5,
      report: event => events.push(event),
    },
  );
  const firstRace = runDiagnostic(first, "trace_diag_a", "session-verified");
  const secondRace = runDiagnostic(second, "trace_diag_b", "turn-failed");
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount()).toBe(baseline + 2);

  const results = await Promise.allSettled([firstRace, secondRace]);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toBeInstanceOf(Error);
      expect((result.reason as Error).message).toBe("ChatGPT browser diagnostic capture timed out");
    }
  }
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-timeout",
    traceId: "trace_diag_a",
    checkpoint: "session-verified",
    outstanding: baseline + 2,
  }));
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-timeout",
    traceId: "trace_diag_b",
    checkpoint: "turn-failed",
    outstanding: baseline + 2,
  }));

  first.resolve("late");
  await nextTask();
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount()).toBe(baseline + 1);
  second.reject(new Error("late diagnostic rejection"));
  await nextTask();
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount()).toBe(baseline);
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-late-settlement",
    traceId: "trace_diag_a",
    checkpoint: "session-verified",
    outcome: "resolve",
    outstanding: baseline + 1,
  }));
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-late-settlement",
    traceId: "trace_diag_b",
    checkpoint: "turn-failed",
    outcome: "reject",
    outstanding: baseline,
  }));
});

test("send press and poll evidence reporting cannot change the submission verdict", async () => {
  expect(CHATGPT_SUBMISSION_POLL_INTERVAL_MS).toBe(50);
  const originalInfo = console.info;
  console.info = () => { throw new Error("logging unavailable"); };
  try {
    expect(() => reportChatGptBrowserEvidence({
      event: "send-press-complete",
      traceId: "trace_verdict",
      elapsedMs: 1,
    })).not.toThrow();

    const hidden = {
      filter: () => hidden,
      last: () => hidden,
      isVisible: async () => false,
      count: async () => 0,
    };
    const page = {
      locator: () => hidden,
      evaluate: async () => false,
    } as unknown as Page;
    const userTurns = { count: async () => 1 };
    const responseTurns = { count: async () => 0 };
    const waitForSubmissionAccepted = (ChatGptBrowserWorker.prototype as unknown as {
      waitForSubmissionAccepted(
        traceId: string,
        page: Page,
        userTurns: unknown,
        responseTurns: unknown,
        responseTurn: unknown,
        initialUserTurnCount: number,
        initialResponseTurnCount: number,
        initialGenerationRunning: boolean,
      ): Promise<string>;
    }).waitForSubmissionAccepted;

    await expect(waitForSubmissionAccepted.call(
      {},
      "trace_verdict",
      page,
      userTurns,
      responseTurns,
      {},
      0,
      0,
      false,
    )).resolves.toBe("user_turn");
  } finally {
    console.info = originalInfo;
  }
});
