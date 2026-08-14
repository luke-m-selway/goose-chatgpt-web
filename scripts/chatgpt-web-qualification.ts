import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  analyzeNaturalTopology,
  analyzeQualification,
  assertOutputOutsideRepository,
  captureQualificationBaseline,
  loadBaseline,
  loadRunManifest,
  renderNaturalTopologyVerdict,
  renderQualificationVerdict,
} from "../src/qualification/chatgpt-web-qualification";

const repositoryRoot = resolve(import.meta.dir, "..");

function usage(): never {
  throw new Error(
    "Usage:\n"
    + "  bun run scripts/chatgpt-web-qualification.ts baseline --output PATH [--runtime-home PATH]\n"
    + "  bun run scripts/chatgpt-web-qualification.ts analyze --baseline PATH --json PATH --report PATH"
    + " [--run-manifest PATH] [--expected-traces N]\n"
    + "  bun run scripts/chatgpt-web-qualification.ts natural-analyze --baseline PATH --json PATH --report PATH"
    + " [--expected-traces N] [--minimum-overlap-ms N]",
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

function writeArtifact(path: string, contents: string): void {
  const output = resolve(path);
  assertOutputOutsideRepository(repositoryRoot, output);
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  writeFileSync(output, contents, { mode: 0o600 });
}

const args = process.argv.slice(2);
const command = args.shift();

if (command === "baseline") {
  const outputPath = required(args, "--output");
  const runtimeHome = option(args, "--runtime-home")
    ?? process.env.CODEX_CHATGPT_WEB_HOME?.trim()
    ?? usage();
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
  const baseline = captureQualificationBaseline({ repositoryRoot, runtimeHome });
  writeArtifact(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(`BASELINE RECORDED\n${resolve(outputPath)}\n`);
  process.stdout.write(`Evidence boundary clean: ${baseline.evidenceBoundaryClean ? "yes" : "no"}\n`);
  process.stdout.write(`Processes: daemon=${baseline.processes.daemonPid ?? "none"}`
    + ` BrowserHost=${baseline.processes.browserHostPid ?? "none"}`
    + ` tunnel=${baseline.processes.tunnelPid ?? "none"}`
    + ` broker=${baseline.processes.brokerPid ?? "none"}`
    + ` helper=${baseline.processes.browserHelperPids.join(",") || "none"}\n`);
} else if (command === "analyze") {
  const baselinePath = required(args, "--baseline");
  const jsonPath = required(args, "--json");
  const reportPath = required(args, "--report");
  const runManifestPath = option(args, "--run-manifest");
  const expectedValue = option(args, "--expected-traces");
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
  const expectedTraceCount = expectedValue === undefined ? undefined : Number(expectedValue);
  if (expectedTraceCount !== undefined && (!Number.isInteger(expectedTraceCount) || expectedTraceCount < 1)) {
    throw new Error("--expected-traces must be a positive integer");
  }
  const analysis = analyzeQualification({
    baseline: loadBaseline(baselinePath),
    runManifest: runManifestPath ? loadRunManifest(runManifestPath) : null,
    expectedTraceCount,
  });
  const verdict = renderQualificationVerdict(analysis);
  writeArtifact(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`);
  writeArtifact(reportPath, verdict);
  process.stdout.write(verdict);
  process.exitCode = analysis.verdict === "qualified" ? 0 : 1;
} else if (command === "natural-analyze") {
  const baselinePath = required(args, "--baseline");
  const jsonPath = required(args, "--json");
  const reportPath = required(args, "--report");
  const expectedValue = option(args, "--expected-traces");
  const overlapValue = option(args, "--minimum-overlap-ms");
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
  const expectedTraceCount = expectedValue === undefined ? undefined : Number(expectedValue);
  if (expectedTraceCount !== undefined && (!Number.isInteger(expectedTraceCount) || expectedTraceCount < 1)) {
    throw new Error("--expected-traces must be a positive integer");
  }
  const minimumCommonOverlapMs = overlapValue === undefined ? undefined : Number(overlapValue);
  if (minimumCommonOverlapMs !== undefined && (!Number.isInteger(minimumCommonOverlapMs) || minimumCommonOverlapMs < 0)) {
    throw new Error("--minimum-overlap-ms must be a non-negative integer");
  }
  const analysis = analyzeNaturalTopology({
    baseline: loadBaseline(baselinePath),
    expectedTraceCount,
    minimumCommonOverlapMs,
  });
  const verdict = renderNaturalTopologyVerdict(analysis);
  writeArtifact(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`);
  writeArtifact(reportPath, verdict);
  process.stdout.write(verdict);
  process.exitCode = analysis.verdict === "PASS" ? 0 : 1;
} else {
  usage();
}
