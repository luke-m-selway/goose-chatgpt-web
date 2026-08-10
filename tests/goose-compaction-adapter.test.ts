import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatGptWebAdapterError } from "../src/adapters/chatgpt-web/adapter-error";
import { ChatGptBrowserWorker, type BrowserTurn } from "../src/adapters/chatgpt-web/browser-worker";
import { createChatGptWebAdapter } from "../src/adapters/chatgpt-web/index";
import { standaloneRetryCircuit } from "../src/adapters/chatgpt-web/retry-circuit";
import { TurnBroker } from "../src/adapters/chatgpt-web/turn-broker";
import { chatGptTurnSessions } from "../src/adapters/chatgpt-web/turn-execution";
import { defaultConfig } from "../src/config";
import {
  STOCK_GOOSE_COMPACTION_SYSTEM_PREFIX,
  STOCK_GOOSE_COMPACTION_SYSTEM_TAIL,
  STOCK_GOOSE_COMPACTION_USER_PROMPT,
} from "../src/responses/goose-compaction";
import { responseRequest } from "../src/server";
import type { CodexProviderConfig } from "../src/types";

const model = "chatgpt-web/high";
const summary = "checkpoint summary";

function stockRequest(): Record<string, unknown> {
  return {
    model,
    stream: true,
    store: false,
    instructions: `${STOCK_GOOSE_COMPACTION_SYSTEM_PREFIX}user: inspect the project${STOCK_GOOSE_COMPACTION_SYSTEM_TAIL}`,
    reasoning: { effort: "low" },
    input: [{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: STOCK_GOOSE_COMPACTION_USER_PROMPT }],
    }],
  };
}

function request(): Request {
  return new Request("http://127.0.0.1:17841/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(stockRequest()),
  });
}

function standaloneConfig() {
  return { ...defaultConfig("full"), standalone: true, proAvailable: true };
}

function testProvider(unique: string): CodexProviderConfig {
  return {
    adapter: "chatgpt-web",
    baseUrl: `browser://goose-compaction-${unique}`,
    chatgptWeb: {
      standalone: true,
      localToolsEnabled: true,
      proAvailable: true,
      headed: false,
      storageStatePath: join(tmpdir(), `cgw-goose-compaction-${unique}.json`),
      brokerSocketPath: join(tmpdir(), `cgw-goose-compaction-${unique}.sock`),
    },
  };
}

function countFrames(sse: string, event: string): number {
  return sse.match(new RegExp(`event: ${event.replaceAll(".", "\\.")}`, "g"))?.length ?? 0;
}

test("stock Goose compaction uses the real adapter without broker registration or a connector token", async () => {
  const unique = `${process.pid}-${Date.now()}-readonly`;
  const provider = testProvider(unique);
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  const broker = TurnBroker.forSocket(provider.chatgptWeb!.brokerSocketPath!);
  const mutableBroker = broker as unknown as { register(...args: unknown[]): Promise<string> };
  const originalRegister = mutableBroker.register.bind(broker);
  let browserStarts = 0;
  let brokerRegistrations = 0;
  let preparedText = "";

  mutableBroker.register = async () => {
    brokerRegistrations += 1;
    throw new Error("broker registration must not run for stock Goose compaction");
  };
  mutableWorker.run = async turn => {
    browserStarts += 1;
    expect(turn.capabilities.localToolsEnabled).toBeFalse();
    const prepared = await turn.prepare();
    preparedText = prepared.text;
    turn.onTextDelta(summary);
    return summary;
  };
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();

  try {
    const adapter = createChatGptWebAdapter(provider);
    const response = await responseRequest(request(), standaloneConfig(), () => adapter);
    const sse = await response.text();
    expect(sse).toContain(summary);
    expect(browserStarts).toBe(1);
    expect(brokerRegistrations).toBe(0);
    expect(preparedText).toContain("This is a Goose history-compaction checkpoint");
    expect(preparedText).toContain("Do not call local or ChatGPT-native tools");
    expect(preparedText).not.toMatch(/\bturn_[A-Za-z0-9_-]{32}\b/);
    expect(preparedText).not.toContain("use the attached Goose Native plugin");
  } finally {
    mutableWorker.run = originalRun;
    mutableBroker.register = originalRegister;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
    await broker.close();
  }
});

test("browser-control terminal failure retires the session and PR18 permits only one recovery browser", async () => {
  const unique = `${process.pid}-${Date.now()}-liveness`;
  const provider = testProvider(unique);
  const worker = ChatGptBrowserWorker.forProvider(provider);
  const mutableWorker = worker as unknown as { run(turn: BrowserTurn): Promise<string> };
  const originalRun = mutableWorker.run.bind(worker);
  let browserStarts = 0;

  mutableWorker.run = async () => {
    browserStarts += 1;
    throw new ChatGptWebAdapterError(
      "ChatGPT browser/CDP control path became unresponsive after the message was sent.",
      {
        status: 502,
        errorType: "server_error",
        code: "chatgpt_browser_control_unresponsive",
        retryable: true,
      },
    );
  };
  chatGptTurnSessions.clear();
  standaloneRetryCircuit.clear();

  try {
    const adapter = createChatGptWebAdapter(provider);
    const run = async () => (await responseRequest(request(), standaloneConfig(), () => adapter)).text();

    const first = await run();
    expect(countFrames(first, "response.failed")).toBe(1);
    expect(first).toContain("chatgpt_browser_control_unresponsive");
    expect(first).toEndWith("data: [DONE]\n\n");
    expect(browserStarts).toBe(1);

    const second = await run();
    expect(countFrames(second, "response.failed")).toBe(1);
    expect(second).toContain("chatgpt_browser_control_unresponsive");
    expect(second).toEndWith("data: [DONE]\n\n");
    expect(browserStarts).toBe(2);

    const third = await run();
    expect(countFrames(third, "response.failed")).toBe(1);
    expect(third).toContain("chatgpt_retry_circuit_open");
    expect(third).toEndWith("data: [DONE]\n\n");
    expect(browserStarts).toBe(2);
  } finally {
    mutableWorker.run = originalRun;
    chatGptTurnSessions.clear();
    standaloneRetryCircuit.clear();
    await TurnBroker.forSocket(provider.chatgptWeb!.brokerSocketPath!).close();
  }
});
