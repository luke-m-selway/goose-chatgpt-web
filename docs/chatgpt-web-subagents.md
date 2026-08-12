# ChatGPT-Web subagents under Electron

Status: **active qualification; not yet proven**.

This document is the durable qualification record for ordinary Goose sessions whose parent provider is ChatGPT-Web and whose Goose-native child agent also uses ChatGPT-Web under the current Electron BrowserHost architecture.

Do not treat structural concurrency support as a live qualification. Until the proofs below pass, the existing repository rule remains in force: avoid parallel ChatGPT-Web child fan-out.

## Objective

Qualify the smallest reliable operating envelope for:

```text
ordinary Goose parent
  → ChatGPT-Web provider turn
  → Goose-native Summon/delegate
  → ChatGPT-Web child provider turn
  → separate Electron BrowserHost surface
```

Target operating policy if proven:

- normal maximum: one ChatGPT-Web parent + two ChatGPT-Web children;
- rare maximum worth qualifying: parent + three ChatGPT-Web children;
- do not optimize for BrowserHost's five-tab safety ceiling;
- continue to prefer cheaper/free workers when another strong ChatGPT-Web child is unnecessary.

This is provider/runtime qualification. Day Shift may later decide when to use the capability, but provider-specific concurrency policy does not belong in Day Shift until it is live-proven here.

## Ownership boundary

No new orchestration layer is intended.

Correct ownership remains:

```text
Goose creates and manages the subagent
  → selected child provider creates a normal provider turn
  → Electron supplies an isolated ChatGPT-Web browser surface
```

Goose continues to own logical conversation/session state, tools and approvals, delegation/subagents, recipes/extensions, project execution, and context lifecycle.

Electron continues to own BrowserHost only. Do not add Electron-specific delegation semantics, another task queue, another session database, a custom subagent scheduler, or a provider router.

## Current evidence

### Proven

- Ordinary Goose can use ChatGPT-Web as its main provider through the current Electron runtime.
- Goose-native delegation from a ChatGPT-Web parent to explicit non-ChatGPT providers was proven under the earlier managed-Chrome transport.
- The managed-Chrome implementation also showed that ChatGPT's own connector safety gate can intermittently block otherwise valid Goose Native tool calls; a connector-side safety rejection therefore must not automatically be classified as a browser/runtime defect.

### Structurally supported but not yet live-qualified for recursive children

The current BrowserHost already supports multiple active browser turns:

- `turnTabs` tracks multiple active turns;
- each turn receives its own `WebContentsView`;
- each turn receives distinct trace and surface identity;
- helper/heartbeat state is turn-scoped;
- terminal cleanup releases only the completed turn while leaving other running tabs untouched;
- the hard BrowserHost safety ceiling is five simultaneous ChatGPT browser turns.

These properties justify testing concurrency but do not prove parent → child recursion.

### Failed before child launch

The first Electron child attempt asked a ChatGPT-Web parent to create an ad-hoc delegate with explicit:

- provider `custom_chatgpt_web__local_1`;
- model `chatgpt-web/medium`.

The Goose Native tool call was rejected with ChatGPT/OpenAI's safety-block response before the delegated child started.

Therefore:

- child launched: **FAIL**;
- parent survived: **PASS**;
- Electron child concurrency: **NOT TESTED**.

Do not record that attempt as an Electron/browser failure.

## Goose-native mechanism to qualify

Use Goose's built-in Summon named-source delegation rather than inventing a custom delegation path.

Current Goose supports named recipes/agents discovered by Summon. A named recipe can carry child execution policy in its `settings`, including:

- `goose_provider`;
- `goose_model`;
- `max_turns`;
- recipe extension configuration.

The parent can then generate the minimal call shape:

```text
delegate(source: "<named-worker>")
```

This is preferable for the next proof because provider/model selection stays in deterministic Goose configuration instead of appearing as low-level execution configuration inside the model-generated tool payload.

Provider/model inheritance remains a valid Goose feature, but the first qualification should explicitly select ChatGPT-Web in the named recipe so the test cannot accidentally inherit another provider.

## Next proof — named recipe, one child

Before changing transport code, create a disposable recipe outside tracked project files, for example under a disposable working directory's `.goose/recipes/`:

```yaml
version: 1.0.0
title: ChatGPT-Web child qualification
description: Disposable inference-only ChatGPT-Web child
instructions: >-
  Return exactly child-one-ok and nothing else.
extensions: []
settings:
  goose_provider: custom_chatgpt_web__local_1
  goose_model: chatgpt-web/medium
  max_turns: 1
```

The parent should be asked only to invoke the named worker and report the result. The intended Goose-native tool call is source-only; do not add provider, model, working directory, arbitrary context, response schema, or tool-heavy instructions to this first proof.

No repository code change is required before this test.

If the first source-only attempt receives the same connector safety rejection before Goose starts a child, one identical retry in a fresh disposable parent is permitted because historical managed-Chrome evidence established intermittent connector safety classification. Do not alter wording or weaken/bypass safety controls.

If both identical source-only attempts are safety-blocked, the next diagnostic should use a known harmless named non-ChatGPT worker as a control. That distinguishes a general Summon/delegate safety gate from a restriction correlated specifically with the ChatGPT-Web child target.

## Failure classification

Keep these failure classes separate.

### Connector safety failure

Evidence:

- ChatGPT/OpenAI safety-block text;
- no delegated Goose child execution;
- no child provider trace;
- no second BrowserHost surface.

Interpretation: the proof did not reach Electron concurrency.

### Recipe/discovery failure

Evidence:

- named source not found;
- recipe parse/configuration error;
- no child provider turn.

Interpretation: fix the disposable Goose test setup, not the browser runtime.

### Goose provider-resolution / recursive-provider failure

Evidence:

- delegate accepted and recipe resolved;
- child creation fails while resolving/creating `custom_chatgpt_web__local_1` or `chatgpt-web/medium`;
- no child BrowserHost trace.

Interpretation: investigate native Goose/provider registration before Electron.

### Electron concurrency failure

Evidence:

- delegated child provider turn starts;
- a child ChatGPT-Web trace is issued;
- BrowserHost lease/surface/CDP/heartbeat ownership then fails.

Interpretation: this is the first failure class that can justify transport code changes.

### Account rate limit

Evidence:

- structured HTTP 429 / `rate_limit_exceeded` from the existing ChatGPT rate-limit detection.

Interpretation: account/request-rate behavior, not automatically a BrowserHost concurrency defect. Do not add arbitrary sleeps unless repeated live evidence shows pacing is the limiting factor.

### Isolation failure

Evidence can include:

- wrong result routed to the wrong Goose session;
- trace/surface ownership crossing;
- heartbeat owner mismatch;
- child completion terminating/corrupting the parent;
- parent completion corrupting a still-running child.

Interpretation: stop fan-out qualification and repair isolation before proceeding.

## Qualification ladder

Keep each proof disposable, bounded, and short.

### Proof A — independent Electron concurrency control

Optional. Run two unrelated disposable ordinary Goose ChatGPT-Web sessions concurrently only if it becomes useful to isolate BrowserHost concurrency independently of delegation.

### Proof B — one named ChatGPT-Web child

Required next proof.

Pass requires:

- source-only Goose-native delegate accepted;
- child Goose task actually created;
- child uses `custom_chatgpt_web__local_1` / `chatgpt-web/medium`;
- distinct child Electron trace/surface appears;
- child returns `child-one-ok`;
- parent remains alive and receives the child result.

### Proof C — real overlap

After Proof B, demonstrate parent and child are concurrently active rather than merely sequential. Prefer trace/browser timestamps and live surface state over artificial sleeps.

Pass requires distinct overlapping active intervals and clean independent release/heartbeat behavior.

### Proof D — two parallel children

Main target capability.

Parent launches two bounded ChatGPT-Web children that return distinct fixed values such as `child-a-ok` and `child-b-ok`.

Pass requires genuine overlap of three ChatGPT-Web turns:

- parent;
- child A;
- child B.

Both results must return to the correct parent without trace/surface crossover.

### Proof E — one child with harmless Goose tool authority

After inference-only recursion works, run one child that performs one read-only Goose-native action against a harmless repository file.

Pass requires separate, valid turn-scoped Goose Native authority for parent and child, with no `turn_token`/capability leakage and the child tool call executing against the child Goose turn.

### Proof F — optional third child

Only after all previous proofs are clean. Qualify parent + three ChatGPT-Web children as rare capacity, not the default operating mode.

Do not test five simultaneous children without new evidence giving a concrete reason.

## Evidence to retain for successful proofs

For each proof, record only the evidence needed to support the exact claim:

- parent/child Goose session or task identity where relevant;
- parent and child provider/model selection;
- distinct browser trace IDs;
- distinct BrowserHost tab/surface IDs;
- creation/active/completion timestamps sufficient to establish overlap where required;
- child result returned to the parent;
- relevant release/heartbeat evidence;
- any observed structured 429;
- tool-authority evidence for Proof E.

Do not claim a higher concurrency level than was live-proven.

## Promotion rule

The capability remains **unqualified** until Proof B passes.

If Proof B passes but Proof D does not, document only the smaller reliable envelope. If parent + two children is reliable but parent + three is not, the supported operating ceiling is parent + two.

A smaller reliable envelope is preferable to using the BrowserHost's larger safety ceiling.

## Qualification log

### 2026-08-12 — initial review

- Current repository checkpoint: `40c29bfc59f6e51f1742784824110cd53e907de7`.
- Current code remains structurally multi-turn under Electron.
- First ad-hoc recursive child attempt was blocked by ChatGPT/OpenAI safety classification before child launch.
- Managed-Chrome history confirms both successful Goose-native delegation and intermittent connector-side safety blocking.
- Current Goose Summon supports the cleaner named-source recipe path.
- Decision: make **no transport code change before the named-recipe one-child proof**.
- Next proof: Proof B.
