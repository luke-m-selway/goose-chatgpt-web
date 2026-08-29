import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatGptWebAdapterError } from "../src/adapters/chatgpt-web/adapter-error";
import { startPostSendBrowserControlLiveness } from "../src/adapters/chatgpt-web/control-liveness";
import { ChatGptBrowserWorker, chatGptTurnProgressSignature, type BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { createChatGptWebAdapter } from "../src/adapters/chatgpt-web/index";
import { StandaloneRetryCircuit, standaloneRetryCircuit, standaloneRetrySnapshot } from "../src/adapters/chatgpt-web/retry-circuit";
import { ChatGptTextFeed, ChatGptTraceFeed, ChatGptTurnSessions, chatGptTurnExecutionKey, chatGptTurnSessions } from "../src/adapters/chatgpt-web/turn-execution";
import { TurnBroker } from "../src/adapters/chatgpt-web/turn-broker";
import { defaultConfig } from "../src/config";
import { parseRequest } from "../src/responses/parser";
import { prepareStandaloneTextRequest, prepareStandaloneToolRequest, routeChatGptWebRequest } from "../src/server";
import type { AdapterEvent, CodexProviderConfig } from "../src/types";
import { LAUNCHER_BROWSER_HOST_KIND } from "../src/launcher-browser-host";

const scope = "standalone-test-scope";
const model = "chatgpt-web/high";

function retryableFailure(message = "ChatGPT ended the turn with 'Something went wrong'. Retry the turn."): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(message, {
    status: 502,
    errorType: "server_error",
    code: "upstream_server_error",
    retryable: true,
  });
}

function rateLimitFailure(): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(
    "ChatGPT rate limit: too many requests are being made too quickly. Wait before retrying.",
    {
      status: 429,
      errorType: "rate_limit_error",
      code: "rate_limit_exceeded",
      retryable: true,
    },
  );
}

function expectCircuitOpen(run: () => void): ChatGptWebAdapterError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ChatGptWebAdapterError);
    expect(error).toMatchObject({
      status: 409,
      errorType: "invalid_request_error",
      code: "chatgpt_retry_circuit_open",
      retryable: false,
    });
    expect(String(error)).toContain("no new browser tab was opened");
    expect(String(error)).toContain("Stop the currently generating Goose turn");
    return error as ChatGptWebAdapterError;
  }
  throw new Error("expected retry circuit to be open");
}

function user(text: string): Record<string, unknown> {
  return { type: "message", role: "user", content: [{ type: "input_text", text }] };
}

test("ordinary duplicate request reuses one session and spends one browser reservation", async () => {
  const circuit = new StandaloneRetryCircuit();
  const sessions = new ChatGptTurnSessions();
  const snapshot = [user("Do the task")];
  let browserStarts = 0;
  const start = () => {
    circuit.reserve(scope, "exact-a", snapshot);
    browserStarts += 1;
    return {
      mode: "read-only" as const,
      browser: Promise.resolve("done"),
      trace: new ChatGptTraceFeed(),
      text: new ChatGptTextFeed(),
      cancel: () => {},
    };
  };

  const first = sessions.getOrCreate("exact-a", start);
  await first.browserOutcome;
  const duplicate = sessions.getOrCreate("exact-a", start);

  expect(duplicate).toBe(first);
  expect(browserStarts).toBe(1);
  sessions.clear();
});

test("normal function-call output continuation keeps the identical browser execution key", () => {
  const config = { ...defaultConfig("full"), standalone: true };
  const proofTool = {
    type: "function",
    name: "get_proof_nonce",
    description: "Return the proof nonce.",
    parameters: { type: "object", properties: {} },
  };
  const initial = {
    model,
    tools: [proofTool],
    input: [user("Call get_proof_nonce and return it")],
  };
  const continued = {
    ...initial,
    input: [
      ...initial.input,
      { type: "function_call", call_id: "call_1", name: "get_proof_nonce", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: "proof-value" },
    ],
  };

  const firstKey = chatGptTurnExecutionKey(parseRequest(prepareStandaloneToolRequest(initial, config)));
  const continuationKey = chatGptTurnExecutionKey(parseRequest(prepareStandaloneToolRequest(continued, config)));
  expect(continuationKey).toBe(firstKey);
});

test("retryable browser failure permits exactly one bounded fresh-browser recovery", () => {
  const circuit = new StandaloneRetryCircuit();
  const snapshot = [user("Do the task")];
  const failure = retryableFailure();
  let browserStarts = 0;
  const start = () => {
    circuit.reserve(scope, "exact-a", snapshot);
    browserStarts += 1;
  };

  start();
  circuit.noteFailure("exact-a", snapshot, failure);
  start();
  circuit.noteFailure("exact-a", snapshot, failure);
  expectCircuitOpen(start);

  expect(browserStarts).toBe(2);
});

test("post-send liveness tolerates transient control failures while the turn is still progressing", async () => {
  const outcomes = [false, false, false];
  let probes = 0;
  let progressing = true;
  const watch = startPostSendBrowserControlLiveness(
    async () => {
      probes += 1;
      if (outcomes.shift() === false) throw new Error("synthetic CDP timeout");
      return true;
    },
    {
      intervalMs: 2,
      probeTimeoutMs: 10,
      maxConsecutiveFailures: 2,
      isProgressing: () => progressing,
    },
  );

  try {
    const result = await Promise.race([
      watch.failure.then(() => "failed", () => "failed"),
      Bun.sleep(20).then(() => "still-waiting"),
    ]);
    expect(result).toBe("still-waiting");
    expect(probes).toBeGreaterThanOrEqual(2);
  } finally {
    progressing = false;
    watch.stop();
  }
});

test("post-send liveness still fails once progress stops and probe failures continue", async () => {
  let probes = 0;
  let progressing = true;
  const watch = startPostSendBrowserControlLiveness(
    async () => {
      probes += 1;
      if (progressing) {
        if (probes <= 3) throw new Error("synthetic CDP timeout");
        return true;
      }
      throw new Error("synthetic CDP timeout");
    },
    {
      intervalMs: 2,
      probeTimeoutMs: 10,
      maxConsecutiveFailures: 2,
      isProgressing: () => progressing,
    },
  );

  try {
    const first = await Promise.race([
      watch.failure.then(() => "failed", () => "failed"),
      Bun.sleep(12).then(() => "still-waiting"),
    ]);
    expect(first).toBe("still-waiting");
    progressing = false;
    const second = await Promise.race([
      watch.failure.then(() => "failed", () => "failed"),
      Bun.sleep(100).then(() => "still-waiting"),
    ]);
    expect(second).toBe("failed");
    await expect(watch.failure).rejects.toMatchObject({
      code: "chatgpt_browser_control_unresponsive",
      retryable: true,
    });
    expect(probes).toBeGreaterThanOrEqual(2);
  } finally {
    watch.stop();
  }
});

test("post-send liveness survives probe failure while only trace/HTML activity advances", async () => {
  // The A1 gate reads the same broad signature the completed-turn-action watchdog uses, so a
  // tool-heavy round whose visible answer text never changes still counts as observable progress.
  let traceBlockCount = 1;
  const signatureOf = () => chatGptTurnProgressSignature({
    visibleText: "partial answer",
    fullHtml: `<div>partial answer</div>${"<span>tool</span>".repeat(traceBlockCount)}`,
    markdownSegmentCount: 1,
    traceBlockCount,
    running: false,
    completionActionVisible: false,
  });
  let lastSignature = signatureOf();
  let advancing = true;

  const watch = startPostSendBrowserControlLiveness(
    async () => { throw new Error("synthetic CDP timeout"); },
    {
      intervalMs: 2,
      probeTimeoutMs: 10,
      maxConsecutiveFailures: 2,
      isProgressing: () => {
        if (advancing) traceBlockCount += 1;
        const signature = signatureOf();
        const progressed = signature !== lastSignature;
        lastSignature = signature;
        return progressed;
      },
    },
  );

  try {
    // Every probe fails, yet the turn is never terminated while the signature keeps advancing.
    const first = await Promise.race([
      watch.failure.then(() => "failed", () => "failed"),
      Bun.sleep(40).then(() => "still-waiting"),
    ]);
    expect(first).toBe("still-waiting");
    expect(traceBlockCount).toBeGreaterThan(1);

    // Freeze observable state: the same failing probes now reach the causal terminal.
    advancing = false;
    await expect(watch.failure).rejects.toMatchObject({
      code: "chatgpt_browser_control_unresponsive",
      retryable: true,
    });
  } finally {
    watch.stop();
  }
});

test("failure-history resubmission reaches containment and cannot create further browser runtimes", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  const firstFailure = retryableFailure("FIRST_RETRYABLE_FAILURE");
  const second = [...first, user(`The provider failed with: ${firstFailure.message}`)];
  const secondFailure = retryableFailure("SECOND_RETRYABLE_FAILURE");
  const third = [...second, user(`Retry after: ${secondFailure.message}`)];
  let browserStarts = 0;
  const start = (key: string, snapshot: unknown[]) => {
    circuit.reserve(scope, key, snapshot);
    browserStarts += 1;
  };

  start("exact-a", first);
  circuit.noteFailure("exact-a", first, firstFailure);
  start("exact-b", second);
  circuit.noteFailure("exact-b", second, secondFailure);

  const circuitFailure = expectCircuitOpen(() => start("exact-c", third));
  const fourth = [...third, user(`Retry after: ${circuitFailure.message}`)];
  expectCircuitOpen(() => start("exact-d", fourth));
  expect(browserStarts).toBe(2);
});

test("explicit cancellation opens active or retryable-failed lineages before session recreation", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  const failure = retryableFailure("CANCEL_BEFORE_RECOVERY");
  let browserStarts = 0;
  const start = (key: string, snapshot: unknown[]) => {
    circuit.reserve(scope, key, snapshot);
    browserStarts += 1;
  };

  start("exact-a", first);
  circuit.noteFailure("exact-a", first, failure);
  expect(circuit.cancelOutstanding()).toBe(1);
  expectCircuitOpen(() => start("exact-a", first));
  const cancelledDescendant = [...first, user("Previous attempt: ChatGPT web turn aborted")];
  expectCircuitOpen(() => start("exact-b", cancelledDescendant));
  expect(browserStarts).toBe(1);
});

test("delayed success from a cancelled active reservation cannot remove terminal containment", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  let browserStarts = 0;
  const start = () => {
    circuit.reserve(scope, "exact-a", first);
    browserStarts += 1;
  };

  start();
  expect(circuit.cancelOutstanding()).toBe(1);
  circuit.noteSuccess("exact-a");
  expectCircuitOpen(start);
  expect(browserStarts).toBe(1);
});

test("delayed retryable failure from a cancelled active reservation cannot restore retry budget", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  const delayedFailure = retryableFailure("LATE_CANCELLED_FAILURE");
  let browserStarts = 0;
  const start = (key: string, snapshot: unknown[]) => {
    circuit.reserve(scope, key, snapshot);
    browserStarts += 1;
  };

  start("exact-a", first);
  expect(circuit.cancelOutstanding()).toBe(1);
  circuit.noteFailure("exact-a", first, delayedFailure);
  expectCircuitOpen(() => start("exact-a", first));
  expectCircuitOpen(() => start("exact-b", [...first, user(`Provider error: ${delayedFailure.message}`)]));
  expect(browserStarts).toBe(1);
});

test("a genuinely new user instruction recovers naturally after containment", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  const firstFailure = retryableFailure("FIRST_RETRYABLE_FAILURE");
  const second = [...first, user(`Retry this failed provider call: ${firstFailure.message}`)];
  const secondFailure = retryableFailure("SECOND_RETRYABLE_FAILURE");
  let browserStarts = 0;
  const start = (key: string, snapshot: unknown[]) => {
    circuit.reserve(scope, key, snapshot);
    browserStarts += 1;
  };

  start("exact-a", first);
  circuit.noteFailure("exact-a", first, firstFailure);
  start("exact-b", second);
  circuit.noteFailure("exact-b", second, secondFailure);
  expectCircuitOpen(() => start("blocked", [...second, user(`Retry: ${secondFailure.message}`)]));

  // Keep the old failed-response history, but make the newest user item an actual new instruction.
  const fresh = [
    ...second,
    { type: "message", role: "assistant", content: [{ type: "output_text", text: secondFailure.message }] },
    user("Start a genuinely different task now"),
  ];
  start("exact-new-user", fresh);
  expect(browserStarts).toBe(3);
});

test("rate-limit failures open immediately so HTTP retries cannot hammer browser turns", () => {
  const circuit = new StandaloneRetryCircuit();
  const first = [user("Do the task")];
  const rateLimit = rateLimitFailure();
  let browserStarts = 0;
  const start = (key: string, snapshot: unknown[]) => {
    circuit.reserve(scope, key, snapshot);
    browserStarts += 1;
  };

  start("exact-a", first);
  circuit.noteFailure("exact-a", first, rateLimit);
  expectCircuitOpen(() => start("exact-a", first));
  expectCircuitOpen(() => start("exact-b", [...first, user(`Provider error: ${rateLimit.message}`)]));
  expect(browserStarts).toBe(1);
});

test("retry snapshots remove only bridge identity and volatile turn context before lineage comparison", () => {
  const config = { ...defaultConfig("browser-only"), standalone: true };
  const turnContext = (time: string) => ({
    type: "input_text",
    text: `<turn-context>\n<current-time>${time}</current-time>\n<working-directory>/tmp/project</working-directory>\n</turn-context>`,
  });
  const firstRaw = {
    model,
    input: [{
      role: "user",
      content: [turnContext("2026-08-09 23:00:00 +02:00"), { type: "input_text", text: "Do the task" }],
    }],
  };
  const secondRaw = {
    model,
    input: [
      firstRaw.input[0],
      {
        role: "user",
        content: [turnContext("2026-08-09 23:01:00 +02:00"), { type: "input_text", text: "Retry after BRIDGE_FAILURE" }],
      },
    ],
  };
  const firstSnapshot = standaloneRetrySnapshot(parseRequest(prepareStandaloneTextRequest(firstRaw, config)));
  const secondSnapshot = standaloneRetrySnapshot(parseRequest(prepareStandaloneTextRequest(secondRaw, config)));

  expect(secondSnapshot.slice(0, firstSnapshot.length)).toEqual(firstSnapshot);
  expect(JSON.stringify(firstSnapshot)).not.toContain("standalone_");
  expect(JSON.stringify(firstSnapshot)).not.toContain("<turn-context>");
});

test("helper-side launcher admission classifies only pre-dispatch descriptor failure as retryable", async () => {
  const root = mkdtempSync(join(tmpdir(), "cgw-helper-side-prelease-"));
  const descriptorPath = join(root, "missing-launcher.json");
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://helper-side-prelease-${process.pid}-${Date.now()}`,
    chatgptWeb: {
      browserHost: "launcher",
      browserHostDescriptorPath: descriptorPath,
      localToolsEnabled: false,
      proAvailable: true,
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const runExclusive = (worker as unknown as { runExclusive(turn: BrowserTurn): Promise<string> }).runExclusive.bind(worker);
  try {
    const failure = await runExclusive({
      traceId: "helper-prelease-1",
      modelId: "gpt-5.6-sol",
      reasoning: "high",
      capabilities: { localToolsEnabled: false, proAvailable: true },
      prepare: async () => ({ text: "inspect", images: [], release() {} }),
      onTextDelta() {},
    }).then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(ChatGptWebAdapterError);
    expect(failure).toMatchObject({
      status: 503,
      code: "chatgpt_browser_host_unavailable",
      retryable: true,
      message: `Launcher browser host is unavailable: descriptor is missing at ${descriptorPath}`,
    });
  } finally {
    await worker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing BrowserHost descriptor is retired before exact-key recovery and successful replay stays cached", async () => {
  const unique = `${process.pid}-${Date.now()}-prelease-recovery`;
  const root = mkdtempSync(join(tmpdir(), `cgw-prelease-recovery-${unique}-`));
  const descriptorPath = join(root, "launcher-browser.json");
  const helperPath = join(root, "helper.cjs");
  const config = { ...defaultConfig("browser-only"), standalone: true, proAvailable: true };
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://standalone-prelease-recovery-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: false,
      proAvailable: true,
      browserHost: "launcher",
      browserHostDescriptorPath: descriptorPath,
      brokerSocketPath: join(root, "broker.sock"),
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  let browserStarts = 0;
  mutableWorker.run = turn => {
    browserStarts += 1;
    return originalRun(turn);
  };
  const adapter = createChatGptWebAdapter(provider);
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();

  const parsed = () => {
    const prepared = prepareStandaloneTextRequest({ model, stream: false, input: [user("Do the task")] }, config);
    const request = parseRequest(prepared);
    routeChatGptWebRequest(request, config);
    return request;
  };
  const run = async () => {
    const events: AdapterEvent[] = [];
    await adapter.runTurn!(parsed(), { headers: new Headers() }, event => events.push(event));
    return events;
  };

  try {
    const first = await run();
    expect(first.find(event => event.type === "error")).toMatchObject({
      status: 503,
      code: "chatgpt_browser_host_unavailable",
      retryable: true,
      message: `Launcher browser host is unavailable: descriptor is missing at ${descriptorPath}`,
    });
    expect(browserStarts).toBe(1);

    writeFileSync(helperPath, `
      const readline = require("node:readline").createInterface({ input: process.stdin });
      const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
      send({ type: "ready" });
      readline.on("line", line => {
        const message = JSON.parse(line);
        if (message.type === "shutdown") process.exit(0);
        if (message.type !== "run") return;
        send({ type: "event", id: message.id, event: "text", text: "recovered" });
        send({ type: "result", id: message.id, text: "recovered" });
      });
    `, { mode: 0o700 });
    writeFileSync(descriptorPath, `${JSON.stringify({
      version: 1,
      kind: LAUNCHER_BROWSER_HOST_KIND,
      pid: process.pid,
      endpoint: "http://127.0.0.1:39001",
      control: {
        endpoint: "http://127.0.0.1:39002",
        token: "launcher-control-token-0123456789abcdefghijklmnop",
      },
      helper: { executable: process.execPath, script: helperPath },
      partition: "persist:codex-web-gpt-chatgpt",
      idleUrl: "about:blank#codex-web-gpt-browser-host",
      surfaceId: "launcher_surface_id_0123456789AB",
      createdAt: new Date().toISOString(),
    })}\n`, { mode: 0o600 });

    const recovered = await run();
    expect(recovered.some(event => event.type === "text_delta" && event.text === "recovered")).toBe(true);
    expect(recovered.find(event => event.type === "done")).toMatchObject({ endTurn: true });
    expect(browserStarts).toBe(2);

    const replay = await run();
    expect(replay.some(event => event.type === "text_delta" && event.text === "recovered")).toBe(true);
    expect(replay.find(event => event.type === "done")).toMatchObject({ endTurn: true });
    expect(browserStarts).toBe(2);
  } finally {
    mutableWorker.run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
    await worker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("repeated pre-lease BrowserHost absence consumes only the existing two-attempt budget", async () => {
  const unique = `${process.pid}-${Date.now()}-prelease-budget`;
  const root = mkdtempSync(join(tmpdir(), `cgw-prelease-budget-${unique}-`));
  const descriptorPath = join(root, "missing-launcher.json");
  const config = { ...defaultConfig("browser-only"), standalone: true, proAvailable: true };
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://standalone-prelease-budget-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: false,
      proAvailable: true,
      browserHost: "launcher",
      browserHostDescriptorPath: descriptorPath,
      brokerSocketPath: join(root, "broker.sock"),
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  let browserStarts = 0;
  mutableWorker.run = turn => {
    browserStarts += 1;
    return originalRun(turn);
  };
  const adapter = createChatGptWebAdapter(provider);
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();
  const parsed = () => {
    const prepared = prepareStandaloneTextRequest({ model, stream: false, input: [user("Do the task")] }, config);
    const request = parseRequest(prepared);
    routeChatGptWebRequest(request, config);
    return request;
  };
  const run = async () => {
    const events: AdapterEvent[] = [];
    await adapter.runTurn!(parsed(), { headers: new Headers() }, event => events.push(event));
    return events.find(event => event.type === "error");
  };

  try {
    expect(await run()).toMatchObject({ code: "chatgpt_browser_host_unavailable", retryable: true });
    expect(await run()).toMatchObject({ code: "chatgpt_browser_host_unavailable", retryable: true });
    expect(await run()).toMatchObject({ code: "chatgpt_retry_circuit_open", retryable: false });
    expect(browserStarts).toBe(2);
  } finally {
    mutableWorker.run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
    await worker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ambiguous generic browser failures remain settled exact-key replay state", async () => {
  const unique = `${process.pid}-${Date.now()}-ambiguous-replay`;
  const config = { ...defaultConfig("browser-only"), standalone: true, proAvailable: true };
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://standalone-ambiguous-replay-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: false,
      proAvailable: true,
      headed: false,
      storageStatePath: join(tmpdir(), `cgw-ambiguous-storage-${unique}.json`),
      brokerSocketPath: join(tmpdir(), `cgw-ambiguous-broker-${unique}.sock`),
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  let browserStarts = 0;
  mutableWorker.run = async () => {
    browserStarts += 1;
    throw new Error("AMBIGUOUS_BROWSER_FAILURE");
  };
  const adapter = createChatGptWebAdapter(provider);
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();
  const parsed = () => {
    const prepared = prepareStandaloneTextRequest({ model, stream: false, input: [user("Do the task")] }, config);
    const request = parseRequest(prepared);
    routeChatGptWebRequest(request, config);
    return request;
  };
  const run = () => adapter.runTurn!(parsed(), { headers: new Headers() }, () => {});

  try {
    await expect(run()).rejects.toThrow("AMBIGUOUS_BROWSER_FAILURE");
    await expect(run()).rejects.toThrow("AMBIGUOUS_BROWSER_FAILURE");
    expect(browserStarts).toBe(1);
  } finally {
    mutableWorker.run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
  }
});

test("unrelated non-retryable adapter failures remain settled exact-key replay state", async () => {
  const unique = `${process.pid}-${Date.now()}-nonretryable-replay`;
  const config = { ...defaultConfig("browser-only"), standalone: true, proAvailable: true };
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://standalone-nonretryable-replay-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: false,
      proAvailable: true,
      headed: false,
      storageStatePath: join(tmpdir(), `cgw-nonretryable-storage-${unique}.json`),
      brokerSocketPath: join(tmpdir(), `cgw-nonretryable-broker-${unique}.sock`),
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  let browserStarts = 0;
  mutableWorker.run = async () => {
    browserStarts += 1;
    throw new ChatGptWebAdapterError("UNRELATED_NONRETRYABLE_FAILURE", {
      status: 400,
      errorType: "invalid_request_error",
      code: "unrelated_nonretryable_failure",
      retryable: false,
    });
  };
  const adapter = createChatGptWebAdapter(provider);
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();
  const parsed = () => {
    const prepared = prepareStandaloneTextRequest({ model, stream: false, input: [user("Do the task")] }, config);
    const request = parseRequest(prepared);
    routeChatGptWebRequest(request, config);
    return request;
  };
  const run = async () => {
    const events: AdapterEvent[] = [];
    await adapter.runTurn!(parsed(), { headers: new Headers() }, event => events.push(event));
    return events.find(event => event.type === "error");
  };

  try {
    expect(await run()).toMatchObject({ code: "unrelated_nonretryable_failure", retryable: false });
    expect(await run()).toMatchObject({ code: "unrelated_nonretryable_failure", retryable: false });
    expect(browserStarts).toBe(1);
  } finally {
    mutableWorker.run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
  }
});

test("adapter containment stops browser runtime creation before the third exact retry and allows a new user turn", async () => {
  const unique = `${process.pid}-${Date.now()}`;
  const config = { ...defaultConfig("browser-only"), standalone: true, proAvailable: true };
  const provider: CodexProviderConfig = {
    adapter: "chatgpt-web",
    baseUrl: `browser://standalone-retry-integration-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: false,
      proAvailable: true,
      headed: false,
      storageStatePath: join(tmpdir(), `cgw-retry-storage-${unique}.json`),
      brokerSocketPath: join(tmpdir(), `cgw-retry-broker-${unique}.sock`),
    },
  };
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const originalRun = worker.run.bind(worker);
  const adapter = createChatGptWebAdapter(provider);
  const failure = retryableFailure("INTEGRATION_RETRYABLE_FAILURE");
  let browserStarts = 0;
  (worker as unknown as { run: (turn: BrowserTurn) => Promise<string> }).run = async () => {
    browserStarts += 1;
    throw failure;
  };
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();

  const parsedFor = (input: unknown[]) => {
    const prepared = prepareStandaloneTextRequest({ model, stream: false, input }, config);
    const parsed = parseRequest(prepared);
    routeChatGptWebRequest(parsed, config);
    return parsed;
  };
  const run = async (input: unknown[]) => {
    const events: AdapterEvent[] = [];
    await adapter.runTurn!(parsedFor(input), { headers: new Headers() }, event => events.push(event));
    return events.find(event => event.type === "error");
  };

  try {
    const initial = [user("Do the task")];
    expect(await run(initial)).toMatchObject({ retryable: true, code: "upstream_server_error" });
    expect(await run(initial)).toMatchObject({ retryable: true, code: "upstream_server_error" });
    expect(await run(initial)).toMatchObject({ retryable: false, code: "chatgpt_retry_circuit_open" });
    expect(browserStarts).toBe(2);

    const fresh = [
      ...initial,
      { type: "message", role: "assistant", content: [{ type: "output_text", text: failure.message }] },
      user("Start a genuinely new user turn"),
    ];
    expect(await run(fresh)).toMatchObject({ retryable: true, code: "upstream_server_error" });
    expect(browserStarts).toBe(3);
  } finally {
    (worker as unknown as { run: (turn: BrowserTurn) => Promise<string> }).run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
    await TurnBroker.forSocket(provider.chatgptWeb!.brokerSocketPath!).close();
  }
});
