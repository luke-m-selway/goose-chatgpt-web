import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface GooseLauncherBootstrapEnv {
  CODEX_CHATGPT_WEB_HOME: string;
  CODEX_WEB_GPT_LAUNCHER_DATA_DIR: string;
}

export function defaultGooseRuntimeHome(home = homedir()): string {
  return resolve(join(home, ".goose-chatgpt-web-dev"));
}

function expandBootstrapUserPath(value: string, home: string): string {
  // Bootstrap accepts an injected home, so "~" must not fall back to the runner's real home.
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(home, value.slice(2));
  return value;
}

export function gooseLauncherBootstrapEnv(env: NodeJS.ProcessEnv = process.env, home = homedir()): GooseLauncherBootstrapEnv {
  const runtimeHome = env.CODEX_CHATGPT_WEB_HOME?.trim()
    ? resolve(expandBootstrapUserPath(env.CODEX_CHATGPT_WEB_HOME.trim(), home))
    : defaultGooseRuntimeHome(home);
  const launcherDataDir = env.CODEX_WEB_GPT_LAUNCHER_DATA_DIR?.trim()
    ? resolve(expandBootstrapUserPath(env.CODEX_WEB_GPT_LAUNCHER_DATA_DIR.trim(), home))
    : join(runtimeHome, "launcher");
  return {
    CODEX_CHATGPT_WEB_HOME: runtimeHome,
    CODEX_WEB_GPT_LAUNCHER_DATA_DIR: launcherDataDir,
  };
}
