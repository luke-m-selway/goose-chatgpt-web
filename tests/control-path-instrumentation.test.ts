import { expect, test } from "bun:test";
import type { Page } from "playwright-core";
import {
  boundedBrowserControlErrorEvidence,
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
    timeoutEvidence?: () => Record<string, unknown>,
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
        errorClassification: "Error",
        errorReason: "other",
      }));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

test("a stale timed-out diagnostic cannot overlap a later critical stage for the same trace", async () => {
  const events: ChatGptBrowserEvidence[] = [];
  const diagnostic = deferred<string>();
  const traceId = "trace_no_diagnostic_overlap";
  const raced = runChatGptBrowserDiagnosticAction(
    () => diagnostic.promise,
    {
      traceId,
      checkpoint: "turn-failed",
      actionId: "01-turn-failed",
      timeoutMs: 5,
      report: event => events.push(event),
    },
  );
  await expect(raced).rejects.toThrow("ChatGPT browser diagnostic capture timed out");
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount(traceId)).toBe(1);

  let criticalStageStarted = false;
  await expect(runStage.call({}, traceId, "composer_ready", 50, async () => {
    criticalStageStarted = true;
    return "unexpected";
  })).rejects.toThrow("cannot start while a diagnostic control operation is still outstanding");
  expect(criticalStageStarted).toBeFalse();

  diagnostic.resolve("late");
  await nextTask();
  expect(getUnresolvedChatGptBrowserDiagnosticActionCount(traceId)).toBe(0);
  expect(events).toContainEqual(expect.objectContaining({
    event: "diagnostic-action-late-settlement",
    traceId,
    outcome: "resolve",
    traceOutstanding: 0,
  }));
});

test("composer readiness timeout records an outstanding count operation without inventing a count", async () => {
  await captureStageEvidence(async logs => {
    const count = deferred<number>();
    const page = {
      locator: () => ({
        filter: () => ({
          count: () => count.promise,
          first: () => ({ id: "composer" }),
        }),
      }),
    };
    const state = {
      controlOperation: "not_started" as const,
      countAttempts: 0,
      firstVisibleComposerCount: null,
      lastVisibleComposerCount: null,
    };
    const activeComposer = (ChatGptBrowserWorker.prototype as unknown as {
      activeComposer(
        page: unknown,
        timeoutMs: number | undefined,
        observation: { traceId: string; stage: string; state: typeof state },
      ): Promise<unknown>;
    }).activeComposer;
    const raced = runStage.call(
      {},
      "trace_composer_control",
      "composer_ready",
      5,
      () => activeComposer.call({}, page, 500, {
        traceId: "trace_composer_control",
        stage: "composer_ready",
        state,
      }),
      () => ({
        composerControlOperation: state.controlOperation,
        composerCountAttempts: state.countAttempts,
        firstVisibleComposerCount: state.firstVisibleComposerCount,
        lastVisibleComposerCount: state.lastVisibleComposerCount,
      }),
    );

    await expect(raced).rejects.toThrow("ChatGPT browser stage timed out: composer_ready");
    expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
      event: "stage-action-timeout",
      stage: "composer_ready",
      composerControlOperation: "count_outstanding",
      composerCountAttempts: 1,
      firstVisibleComposerCount: null,
      lastVisibleComposerCount: null,
    }));

    count.resolve(1);
    await nextTask();
    expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
      event: "composer-count-observed",
      visibleComposerCount: 1,
    }));
    expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
      event: "stage-action-late-settlement",
      stage: "composer_ready",
      outcome: "resolve",
    }));
  });
});

test("composer readiness preserves an immediate browser-control error", async () => {
  await captureStageEvidence(async logs => {
    const controlError = new Error("Execution context was destroyed");
    const page = {
      locator: () => ({
        filter: () => ({
          count: async () => { throw controlError; },
          first: () => ({ id: "composer" }),
        }),
      }),
    };
    const state = {
      controlOperation: "not_started" as const,
      countAttempts: 0,
      firstVisibleComposerCount: null,
      lastVisibleComposerCount: null,
    };
    const activeComposer = (ChatGptBrowserWorker.prototype as unknown as {
      activeComposer(
        page: unknown,
        timeoutMs: number | undefined,
        observation: { traceId: string; stage: string; state: typeof state },
      ): Promise<unknown>;
    }).activeComposer;

    await expect(runStage.call(
      {},
      "trace_composer_control_error",
      "composer_ready",
      50,
      () => activeComposer.call({}, page, 500, {
        traceId: "trace_composer_control_error",
        stage: "composer_ready",
        state,
      }),
      () => ({
        composerControlOperation: state.controlOperation,
        composerCountAttempts: state.countAttempts,
        firstVisibleComposerCount: state.firstVisibleComposerCount,
        lastVisibleComposerCount: state.lastVisibleComposerCount,
      }),
    )).rejects.toBe(controlError);
    expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
      event: "composer-count-read-failed",
      stage: "composer_ready",
      composerControlOperation: "count_settled",
      composerCountAttempts: 1,
      errorReason: "execution_context_destroyed",
    }));
    expect(evidenceFromLogs(logs)).toContainEqual(expect.objectContaining({
      event: "stage-action-failed",
      stage: "composer_ready",
      errorReason: "execution_context_destroyed",
    }));
  });
});

test("composer readiness records bounded zero and multiple count evidence", async () => {
  for (const visibleComposerCount of [0, 2]) {
    await captureStageEvidence(async logs => {
      const page = {
        locator: () => ({
          filter: () => ({
            count: async () => visibleComposerCount,
            first: () => ({ id: "composer" }),
          }),
        }),
      };
      const state = {
        controlOperation: "not_started" as const,
        countAttempts: 0,
        firstVisibleComposerCount: null,
        lastVisibleComposerCount: null,
      };
      const activeComposer = (ChatGptBrowserWorker.prototype as unknown as {
        activeComposer(
          page: unknown,
          timeoutMs: number,
          observation: { traceId: string; stage: string; state: typeof state },
        ): Promise<unknown>;
      }).activeComposer;

      await expect(activeComposer.call({}, page, 1, {
        traceId: `trace_composer_count_${visibleComposerCount}`,
        stage: "composer_ready",
        state,
      })).rejects.toThrow(`visibleComposers=${visibleComposerCount}`);
      const events = evidenceFromLogs(logs);
      expect(events).toContainEqual(expect.objectContaining({
        event: "composer-count-observed",
        visibleComposerCount,
        observation: "first",
      }));
      expect(events).toContainEqual(expect.objectContaining({
        event: "composer-count-deadline",
        lastVisibleComposerCount: visibleComposerCount,
      }));
    });
  }
});

test("late browser-control errors use bounded reason codes instead of raw messages", () => {
  expect(boundedBrowserControlErrorEvidence(
    new Error("Target page, context or browser has been closed; secret query=value"),
  )).toEqual({
    errorClassification: "Error",
    errorReason: "target_closed",
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
