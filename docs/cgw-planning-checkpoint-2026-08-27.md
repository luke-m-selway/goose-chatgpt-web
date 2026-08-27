# CGW planning checkpoint — 2026-08-27

## Authority

This checkpoint supersedes older future-tense sequencing in PR #35 and `docs/cgw-foundation-implementation-plan-2026-08-21.md` where the older plan conflicts with the current state or priorities. The older foundation plan remains historical/design context for integrated-runtime ownership, readiness, shutdown and rollback semantics.

PR #31 remains the chronological incident/evidence ledger. PR #35 remains the current planning authority.

## Current governing architecture

Near-term operating model:

```text
Luke
  -> one ChatGPT-Web orchestrator
  -> native Goose delegation
  -> non-ChatGPT-Web workers
```

ChatGPT-Web -> ChatGPT-Web child delegation is deferred to a future enhancement. It is no longer a prerequisite or current qualification gate. Same-provider child work should not consume current reliability effort while independent free worker pools are available.

For normal work, there should be one ChatGPT-Web orchestrator/browser execution at a time. Delegated work should use non-CGW providers through Goose-native delegation and the Day Shift delegation skill.

## Live runtime / Gate B state

Live checkout:

`/Users/luke/Documents/goose-chatgpt-web`

Live Git branch:

`fix/electron-native-liveness`

Live Git HEAD remains:

`22b55234f16e1871363281c753eec06ae5ad6eb3`

Protected untracked files:

- `scripts/open-manual-browser.ts`
- `scripts/proof-mcp-server.ts`

Isolated Gate B worktree:

`/Users/luke/Documents/goose-chatgpt-web-gate-b`

Branch:

`fix/durable-pending-tool-recovery`

Reviewed Gate B candidate:

`e1e3a3b181dffe344a89be729b82805d97a5cef5`

The reviewed Gate B runtime was boundedly activated by copying exactly these five files from `e1e3a3b` into the live checkout:

- `launcher/electron/runtime-supervisor.cjs`
- `src/adapters/chatgpt-web/adapter-error.ts`
- `src/adapters/chatgpt-web/index.ts`
- `src/adapters/chatgpt-web/turn-execution.ts`
- `src/server.ts`

Those five live files were proved byte-for-byte identical to the reviewed candidate. The live checkout's Git HEAD itself did not move; activation is therefore a five-file working-tree activation, not a checkout at `e1e3a3b`.

Activation health passed with daemon, tunnel and BrowserHost ready; `turns_enabled=true`; `accepting_turns=true`; zero active/pending turns; and no duplicate runtime processes.

Do not use broad `git checkout -- .` or `git reset --hard` as rollback mechanisms.

## Gate B semantics to preserve

Once a tool call is emitted, its call ID remains a logical obligation until exactly one matching result is reconciled or an explicit logical cancellation occurs.

Browser transport settlement does not itself cancel the logical obligation. Goose/logical execution is durable; browser transport is disposable. A late matching result may require one replacement browser transport in the same logical execution, without re-executing the original tool/delegation and without allowing stale browser settlement to become the logical final.

Independent code review of `e1e3a3b` passed the targeted compaction-resolution, replacement-admission and detached-pending-logical-work boundaries.

The recent same-CGW parent/child attempt did **not** qualify this path: the child failed during composer attachment while the parent browser transport remained alive. Classification was `C` — the decisive durable-recovery path was not exercised.

Under the current architecture, same-CGW child qualification is deferred. Preserve Gate B only insofar as it supports robust single-orchestrator continuation/recovery.

## Current top priority — dual continuation / surface ownership

The latest continuation attempt produced a stronger reliability defect than the deferred child-agent issue.

Observed sequence:

1. one continuation produced both `ChatGPT 1` and `ChatGPT 2` surfaces;
2. `ChatGPT 2` visibly executed part of the continued task and displayed tool/todo output;
3. that visible output did not appear in Goose;
4. both ChatGPT surfaces later closed;
5. one surface reopened/retried while Goose still showed `working`;
6. the requested continuation never successfully completed.

Before another CGW continuation test, reconstruct this incident passively from observations/logs.

Determine:

- one logical execution/session identity and every browser trace/surface involved;
- why the second surface was allocated;
- whether each surface was a replacement transport, ordinary retry, auxiliary context-maintenance/summarization turn, or unintended duplicate;
- whether the user prompt was attached/sent more than once;
- which surface was authoritative for Goose output;
- why visible output from `ChatGPT 2` was not returned to Goose;
- exact retirement/release reasons for both surfaces;
- exact trigger for the reopened surface;
- whether the reopened surface remained in the same logical execution;
- broker/tool obligations and any stale/lost/replayed results across each transition;
- final cleanup/idle state.

Design invariant for ordinary continuation:

- one logical Goose execution;
- normally one active ChatGPT browser transport;
- a replacement surface may become active only after the prior authoritative transport is definitively retired and replacement is required;
- two independently active surfaces doing the same continued work are not acceptable;
- auxiliary maintenance turns must not masquerade as or interfere with the user turn;
- authoritative output binds back to Goose exactly once.

Do not hide an ownership/allocation defect by merely setting `MAX_CHATGPT_BROWSER_TABS=1` unless evidence proves capacity itself is the root cause.

## Composer/CDP diagnostic work

A separate diagnostics-only patch is being completed in the isolated Gate B worktree to explain a prior `composer.fill("")` timeout after `composer_ready` had succeeded.

The patch may record only bounded privacy-safe pre-fill/post-failure composer metadata and control-path latency. It must not change selectors, widen timeout, add generic retries, change send semantics, change concurrency, or alter Gate B semantics.

The original implementation session failed with `ChatGPT response DOM became continuously unreadable after it was observed`, and its continuation also failed. A fresh ChatGPT-Web session has been tasked to inspect the existing worktree and finish only the remaining diagnostic work.

Before activation, get independent non-CGW review and confirm the patch stayed diagnostics-only.

## Day Shift delegation/provider infrastructure — complete

Day Shift PR #30 (provider/free-inference catalogue) is merged.

Day Shift PR #33 (native delegation skill activation) is merged.

Current local/global state has been reconciled:

- canonical tracked skill: `/Users/luke/Documents/day-shift/.agents/skills/day-shift-delegation`;
- `~/.agents/skills/day-shift-delegation` is a symlink to that tracked skill;
- fresh `goose skills list` outside the repo discovers it;
- native `summon` and `skills` are enabled;
- historical `day_shift_delegation` MCP is disabled for ordinary Goose sessions;
- Ollama Cloud is correctly configured to `gemma4:31b-cloud`;
- configured provider pools include OpenRouter, NVIDIA, Kilo Code, OpenCode URL, Cloudflare Free, Requesty Free, `ollama_cloud`, Groq, Mistral, Claude ACP, Codex ACP and local ChatGPT-Web.

Do not restore the legacy Delegation MCP as a normal worker path. Use Goose-native delegation and the Day Shift skill. New provider routes remain qualification candidates until route-specific tool/runtime evidence promotes them.

## Immediate next sequence

1. Ingest the result of the fresh diagnostics-patch ChatGPT-Web session when it returns.
2. Arrange independent non-CGW review of that patch if it is complete; do not activate if scope expanded.
3. Before another CGW continuation test, run a fresh non-CGW read-only forensic reconstruction of the latest dual-surface continuation incident.
4. From that evidence, identify the smallest ownership/lifecycle/result-binding fix.
5. Implement and review in isolation.
6. Activate with a non-CGW worker.
7. Qualify one simple fresh ChatGPT-Web orchestrator turn followed by exactly one ordinary continuation.
8. For real delegated work, use non-CGW workers.
9. Leave ChatGPT-Web child-agent support for later.

## Safety / workflow

- Keep ChatGPT-Web runs scarce until the dual-continuation defect is understood.
- One ChatGPT-Web orchestrator at a time unless concurrency is explicitly being qualified.
- Do not merge/rebase/reset/stash/clean/delete branches or worktrees without explicit authorization.
- Do not mutate the live checkout during implementation work.
- Preserve the two protected untracked scripts.
- Use GitHub MCP for GitHub work.
- Prefer non-CGW workers for passive forensics, review, activation and delegated implementation strands where suitable.
