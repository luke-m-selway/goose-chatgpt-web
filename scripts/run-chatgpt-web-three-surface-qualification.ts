import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  analyzeQualification,
  assertOutputOutsideRepository,
  captureQualificationBaseline,
  CHATGPT_WEB_QUALIFICATION_VERSION,
  readNewGooseSessions,
  renderQualificationVerdict,
  type QualificationRunManifest,
  type QualificationRunSession,
} from "../src/qualification/chatgpt-web-qualification";
import { runCommand } from "../src/process";

const repositoryRoot = resolve(import.meta.dir, "..");
const DEFAULT_TIMEOUT_MS = 15 * 60_000;

interface Workload {
  role: QualificationRunSession["role"];
  recipe: string;
  provider: string;
  model: string;
  marker: string;
}

interface RunningWorkload {
  workload: Workload;
  session: QualificationRunSession;
  child: ChildProcess;
  completion: Promise<number>;
}

const workloads: Workload[] = [
  {
    role: "high",
    recipe: join(repositoryRoot, ".agents", "recipes", "chatgpt-web-concurrency-high.yaml"),
    provider: "custom_chatgpt_web__local_1",
    model: "chatgpt-web/high",
    marker: "high-session-ok",
  },
  {
    role: "child-a",
    recipe: join(repositoryRoot, ".agents", "recipes", "chatgpt-web-concurrency-child-a.yaml"),
    provider: "custom_chatgpt_web__local_1",
    model: "chatgpt-web/medium",
    marker: "child-a-ok",
  },
  {
    role: "child-b",
    recipe: join(repositoryRoot, ".agents", "recipes", "chatgpt-web-concurrency-child-b.yaml"),
    provider: "custom_chatgpt_web__local_1",
    model: "chatgpt-web/medium",
    marker: "child-b-ok",
  },
];

function usage(): never {
  throw new Error(
    "Usage: bun run scripts/run-chatgpt-web-three-surface-qualification.ts"
    + " --runtime-home PATH [--output-dir PATH] [--timeout-ms N]",
  );
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function required(args: string[], name: string): string {
  return option(args, name) ?? usage();
}

function gitStatusSnapshot(): string {
  const result = runCommand("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: repositoryRoot,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Could not read repository status");
  return result.stdout;
}

function sessionName(runId: string, role: Workload["role"]): string {
  return `chatgpt-web-qualification-${runId}-${role}`;
}

function launchWorkload(workload: Workload, runId: string, outputDir: string): RunningWorkload {
  const name = sessionName(runId, workload.role);
  const stdoutPath = join(outputDir, `${workload.role}.stdout.jsonl`);
  const stderrPath = join(outputDir, `${workload.role}.stderr.log`);
  const stdout = openSync(stdoutPath, "wx", 0o600);
  const stderr = openSync(stderrPath, "wx", 0o600);
  const launchedAt = new Date().toISOString();
  const child = spawn("goose", [
    "run",
    "--recipe", workload.recipe,
    "--name", name,
    "--output-format", "stream-json",
    "--max-turns", "12",
  ], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  const completion = new Promise<number>((resolveCompletion, rejectCompletion) => {
    child.once("error", rejectCompletion);
    child.once("exit", (code, signal) => resolveCompletion(code ?? (signal ? 128 : 1)));
  });
  return {
    workload,
    child,
    completion,
    session: {
      role: workload.role,
      name,
      sessionId: null,
      provider: workload.provider,
      model: workload.model,
      launchedAt,
      completedAt: null,
      exitCode: null,
      terminalMarker: workload.marker,
      terminalMarkerObserved: false,
      stdoutPath,
      stderrPath,
    },
  };
}

async function waitWithTimeout(running: RunningWorkload[], timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Three-surface qualification exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const exitCodes = await Promise.race([Promise.all(running.map(item => item.completion)), timeout]);
    for (const [index, exitCode] of exitCodes.entries()) {
      running[index].session.exitCode = exitCode;
      running[index].session.completedAt = new Date().toISOString();
    }
  } catch (error) {
    for (const item of running) {
      if (item.child.exitCode === null && item.child.signalCode === null) item.child.kill("SIGINT");
    }
    await Promise.race([
      Promise.allSettled(running.map(item => item.completion)),
      new Promise(resolveWait => setTimeout(resolveWait, 10_000)),
    ]);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const args = process.argv.slice(2);
const runtimeHome = resolve(required(args, "--runtime-home"));
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const outputDir = resolve(option(args, "--output-dir") ?? join(runtimeHome, "qualification", runId));
const timeoutValue = option(args, "--timeout-ms");
const timeoutMs = timeoutValue === undefined ? DEFAULT_TIMEOUT_MS : Number(timeoutValue);
if (!Number.isInteger(timeoutMs) || timeoutMs < 60_000) throw new Error("--timeout-ms must be an integer of at least 60000");
if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
assertOutputOutsideRepository(repositoryRoot, outputDir);
mkdirSync(outputDir, { recursive: true, mode: 0o700 });

const beforeStatus = gitStatusSnapshot();
const baseline = captureQualificationBaseline({ repositoryRoot, runtimeHome });
const baselinePath = join(outputDir, "baseline.json");
writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
if (!baseline.evidenceBoundaryClean) {
  throw new Error(`Refusing to launch with a dirty evidence boundary: ${baseline.evidenceBoundaryNotes.join("; ")}`);
}

const running: RunningWorkload[] = [];
let runError: unknown;
try {
  for (const workload of workloads) running.push(launchWorkload(workload, runId, outputDir));
  await waitWithTimeout(running, timeoutMs);
} catch (error) {
  runError = error;
} finally {
  const newSessions = readNewGooseSessions(baseline);
  for (const item of running) {
    const matchingSession = newSessions.find(session => session.name === item.session.name);
    item.session.sessionId = matchingSession?.id ?? null;
    item.session.exitCode ??= item.child.exitCode;
    item.session.completedAt ??= new Date().toISOString();
    item.session.terminalMarkerObserved = readFileSync(item.session.stdoutPath, "utf8").includes(item.session.terminalMarker);
  }
  const launched = running.map(item => Date.parse(item.session.launchedAt));
  const manifest: QualificationRunManifest = {
    version: CHATGPT_WEB_QUALIFICATION_VERSION,
    kind: "chatgpt-web-three-surface-run",
    runId,
    repositoryRoot,
    runtimeHome,
    baselinePath,
    launchedAt: new Date(Math.min(...launched)).toISOString(),
    completedAt: new Date().toISOString(),
    launchSpreadMs: Math.max(...launched) - Math.min(...launched),
    repositoryStatusUnchanged: beforeStatus === gitStatusSnapshot(),
    sessions: running.map(item => item.session),
  };
  const manifestPath = join(outputDir, "run-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  const analysis = analyzeQualification({ baseline, runManifest: manifest, expectedTraceCount: 3 });
  const report = renderQualificationVerdict(analysis);
  writeFileSync(join(outputDir, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(outputDir, "verdict.txt"), report, { mode: 0o600 });
  process.stdout.write(report);
  process.stdout.write(`Artifacts: ${outputDir}\n`);
  if (runError) throw runError;
  process.exitCode = analysis.verdict === "qualified" ? 0 : 1;
}
