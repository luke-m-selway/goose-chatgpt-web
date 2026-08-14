const test = require("node:test");
const assert = require("node:assert/strict");
const { BrowserControlServer } = require("../electron/control-server.cjs");

test("browser control server authenticates and owns turn visibility", async () => {
  const calls = [];
  const logs = [];
  const lifecycle = {
    traceId: "abcdef123456",
    surfaceId: "launcher_surface_id_0123456789AB",
    rendererPid: 4567,
    status: "active",
    event: "created",
    revision: 0,
  };
  const host = {
    flightRecorder: { observe: (...args) => calls.push(["observe", ...args]) },
    beginTurn: (...args) => {
      calls.push(["start", ...args]);
      return { surfaceId: "launcher_surface_id_0123456789AB", tabId: "tab-1", lifecycle };
    },
    heartbeatTurn: (...args) => {
      calls.push(["heartbeat", ...args]);
      return lifecycle;
    },
    endTurn: (...args) => calls.push(["end", ...args]),
  };
  const server = await new BrowserControlServer({
    logger: {
      debug: (event, detail) => logs.push(["debug", event, detail]),
      info: (event, detail) => logs.push(["info", event, detail]),
      warn: (event, detail) => logs.push(["warn", event, detail]),
    },
    getBrowserHost: () => host,
    getPreferences: () => ({ showBrowserDuringTurns: true }),
  }).start();
  const descriptor = server.descriptor();
  try {
    const unauthenticated = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "abcdef123456" }),
    });
    assert.equal(unauthenticated.status, 401);

    const invalidOwner = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "abcdef123456", helperPid: 0 }),
    });
    assert.equal(invalidOwner.status, 400);

    const start = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "abcdef123456", helperPid: process.pid }),
    });
    assert.equal(start.status, 200);

    const heartbeat = await fetch(`${descriptor.endpoint}/v1/turn/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "heartbeat", traceId: "abcdef123456", helperPid: process.pid }),
    });
    assert.equal(heartbeat.status, 200);
    assert.deepEqual(await heartbeat.json(), { ok: true, lifecycle });

    const observation = await fetch(`${descriptor.endpoint}/v1/observation/event`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ traceId: "abcdef123456", event: "response.failed", eventId: "event-1" }),
    });
    assert.equal(observation.status, 200);

    const ownerlessEnd = await fetch(`${descriptor.endpoint}/v1/turn/end`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "end", traceId: "abcdef123456", status: "failed" }),
    });
    assert.equal(ownerlessEnd.status, 400);

    const end = await fetch(`${descriptor.endpoint}/v1/turn/end`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "end",
        traceId: "abcdef123456",
        helperPid: process.pid,
        status: "completed",
      }),
    });
    assert.equal(end.status, 200);
    assert.deepEqual(calls, [
      ["start", "abcdef123456", true, process.pid],
      ["heartbeat", "abcdef123456", process.pid],
      ["observe", "abcdef123456", "response.failed", "event-1"],
      ["end", "abcdef123456", process.pid, "completed", true, undefined],
    ]);
    assert.equal(logs.some(([, event, detail]) => (
      event === "browser.turn_started" && detail.lifecycle === lifecycle
    )), true);
    assert.equal(logs.some(([, event, detail]) => (
      event === "browser.turn_heartbeat" && detail.lifecycle === lifecycle
    )), true);
    assert.equal(logs.some(([, event]) => event === "browser.turn_ended"), true);
  } finally {
    await server.close();
  }
});
