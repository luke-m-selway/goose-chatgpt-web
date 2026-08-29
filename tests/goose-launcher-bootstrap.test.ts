import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { defaultGooseRuntimeHome, gooseLauncherBootstrapEnv } from "../src/goose-launcher-bootstrap";

const testHome = resolve("test-home");

test("goose launcher bootstrap defaults to the Goose dev runtime home and launcher data dir", () => {
  const env = gooseLauncherBootstrapEnv({}, testHome);
  const runtimeHome = join(testHome, ".goose-chatgpt-web-dev");
  expect(env).toEqual({
    CODEX_CHATGPT_WEB_HOME: runtimeHome,
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: join(runtimeHome, "launcher"),
  });
  expect(defaultGooseRuntimeHome(testHome)).toBe(runtimeHome);
});

test("goose launcher bootstrap preserves explicit home and launcher data overrides", () => {
  const env = gooseLauncherBootstrapEnv({
    CODEX_CHATGPT_WEB_HOME: "~/custom-goose",
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: "~/custom-launcher-data",
  }, testHome);
  expect(env).toEqual({
    CODEX_CHATGPT_WEB_HOME: join(testHome, "custom-goose"),
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: join(testHome, "custom-launcher-data"),
  });
});
