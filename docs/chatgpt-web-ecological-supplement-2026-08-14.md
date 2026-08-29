# ChatGPT-Web ecological reliability supplement — late 2026-08-14

Status: **evidence supplement for draft PR #31**.

This file preserves late-evening ecological evidence that occurred after the current deployed-checkpoint closeout was written. It supplements `chatgpt-web-reliability-closeout.md`; it does not rewrite the earlier incident chronology or change runtime behavior.

## 1. Descriptor recovery succeeded; identical-request replay was stale registry state

Ordinary Goose use first encountered the genuine pre-reconstruction error:

`Launcher browser host is unavailable: descriptor is missing at /Users/luke/.goose-chatgpt-web-dev/runtime/launcher-browser.json`

The BrowserHost was then reconstructed through the supported lifecycle path. Subsequent evidence showed:

- Responses daemon PID remained `74277`;
- tunnel PID `83662`;
- helper PID `79398`;
- reconstructed BrowserHost PID `86982`;
- canonical readiness traces `lifecycle_51a7d3fb0c2e4641b7c7` and `lifecycle_55b494f91fbe48f28ee6` completed successfully;
- the descriptor existed at the exact configured path with the expected private permissions;
- repeated identical Goose sessions `20260814_28` through `_32` produced no ordinary BrowserHost lease and kept returning the old descriptor-missing error;
- a uniquely identified fresh Goose session `20260814_34` succeeded without daemon restart, leasing BrowserHost on trace `70b87737e109` from roughly 21:26:29 to 21:27:05 CEST and returning `CHATGPT_WEB_OK`.

Codex diagnosis: the genuine pre-reconstruction descriptor-missing failure had been retained by the daemon's per-execution-key session registry. Later identical requests could replay that settled error for the registry TTL (up to roughly 30 minutes) without rechecking the recovered descriptor or leasing BrowserHost.

No path, namespace, configuration, port, daemon-version, or current BrowserHost-availability mismatch was found.

### Classification

This is a distinct provider execution/session-registry defect:

- after BrowserHost recovery, the repeated error was **not evidence that BrowserHost was still absent**;
- restarting Goose did not repair it;
- restarting the daemon was unnecessary for the successful uniquely identified fresh request;
- the defect is separate from browser-control send/composer failures, large-context transport, and provider-demand BrowserHost startup.

## 2. New Goose chats must have new provider execution identity

The user explicitly confirmed an important behavioral requirement from the above incident: making the first prompt unique in a genuinely fresh Goose chat succeeded, but that workaround should not be necessary.

A new Goose chat/turn is a new logical execution even if its prompt text is byte-for-byte identical to an earlier chat.

Required invariant for a later bounded repair:

- fresh Goose session/turn identity must contribute fresh provider execution identity;
- prompt-string equality alone must never make a new chat inherit a prior settled provider error, retry circuit, Temporary Chat lineage, or execution key;
- deliberate idempotency is valid only when an explicit caller-owned idempotency/request identity intentionally denotes the same external operation;
- prompt-content equality is not an idempotency contract;
- independently, transient BrowserHost descriptor/readiness failures should not poison a provider execution entry for the full registry TTL after the underlying BrowserHost has recovered.

Do not solve this by globally disabling settled-result replay/idempotency. Successful deterministic replay behavior should remain intact where the execution identity genuinely denotes the same operation.

## 3. Positive ecological evidence: small-context follow-up remained healthy

The successful fresh ChatGPT-Web Goose session then accepted a normal follow-up while accumulated Goose context was still relatively small.

This was not just a trivial text response. User-provided inline output from the running turn showed productive orchestration and tool activity:

- the parent launched **two bounded free-worker strands** for `ACP/native-continuation inspection` and `test/contract inventory`;
- it recorded a recovery/task checkpoint and continued reading only the implementation slices needed for integration;
- Goose tool/write activity remained available;
- when the harness intermittently blocked broad file-dump commands, the parent explicitly switched to narrow source queries and structural analysis rather than broadening scope or bypassing the requested tool path.

Classification:

- ordinary same-session follow-up remained viable;
- Goose Native/tool use, checkpointing, and bounded delegation remained viable;
- this is useful successful-turn evidence, not merely absence of failure;
- it strengthens, but does **not prove**, the working hypothesis that continuation reliability may degrade as accumulated/replayed Goose context becomes large.

The inline report about broad file-dump commands being blocked is a separate harness/tool-policy observation. Do not classify it as BrowserHost transport failure without trace evidence.

## 4. Relationship to PR #32 — large-context externalization

PR #32 owns the design hypothesis that an ever-growing authoritative Goose context should eventually stop being pushed through one giant ChatGPT composer submission and instead be externalized/read sequentially through a bounded provider/Goose-Native channel.

The evidence set is now two-sided:

- negative ecological evidence: same-session send failures, severe continuation/auto-compaction failures, and materially slower large prompt attachment as accumulated context became large;
- positive ecological evidence: a fresh session and normal follow-up remained productive while current context was still small.

This supports continued investigation of context size as a reliability variable, but **does not establish causality**.

Keep the stale descriptor-error replay out of the large-context hypothesis. It has a separate diagnosed execution-key/session-registry cause.

Any PR #32 implementation must preserve unique logical execution identity independently of prompt text so context externalization does not create another content-keyed replay path.

## 5. Relationship to PR #33 — provider-demand BrowserHost lifecycle

PR #33 owns the lifecycle/UX design for a BrowserHost that is truly absent when ChatGPT-Web is first demanded.

The later stale descriptor-error replay must not broaden PR #33 into generic automatic recovery:

- a genuinely absent/stale BrowserHost owner may be eligible for narrow provider-demand reconstruction;
- an already recovered BrowserHost plus a stale settled execution error is a different defect;
- ambiguous send/composer/network/broker failures remain ineligible as automatic BrowserHost-restart triggers.

The resource-minimizing lifecycle target is:

```text
Goose closed
  -> no ChatGPT-Web processes kept alive solely for Goose

Goose open, ChatGPT-Web unused
  -> keep only the minimum ingress/control component needed for lazy activation
  -> avoid eagerly running Electron/Chromium where a clean Goose lifecycle trigger permits it

first ChatGPT-Web use
  -> lazily start/ensure required provider dependencies
  -> construct BrowserHost only when needed
  -> reuse it across chats/turns for the Goose application lifetime

Goose exits
  -> orderly ChatGPT-Web companion-runtime shutdown
```

Do not start/stop Electron per chat. Prefer lazy first-use plus reuse while Goose is open; avoid adding a second orchestration framework merely to save a small idle process.

## 6. Bounded follow-up work

The next repair for the stale replay defect should stay narrow:

1. identify the execution-key/session-registry settlement path that allowed the transient descriptor-missing error to be replayed into genuinely new Goose executions;
2. preserve explicit logical session/turn identity independently of prompt text;
3. make this transient infrastructure failure non-poisoning for later new executions after recovery, either by retiring the affected execution entry or by using an existing typed retryable/non-cacheable mechanism;
4. preserve the original causal error for the request that truly encountered BrowserHost absence;
5. preserve successful/deterministic idempotent replay where identity intentionally denotes the same operation;
6. add focused regression tests before activation.

Do not combine that repair with PR #32 large-context implementation or PR #33 demand-start implementation.

## 7. Operating interpretation

The practical evidence at this checkpoint is:

- BrowserHost reconstruction itself worked;
- stale provider execution state can currently make a genuinely new chat look broken when an identical prompt is reused;
- uniquely identified new execution works around that defect, but unique wording is **not** an acceptable permanent requirement;
- healthy small-context follow-ups can continue through nontrivial tool/delegation work;
- successful turns should continue to be recorded alongside failures during ecological observation.
