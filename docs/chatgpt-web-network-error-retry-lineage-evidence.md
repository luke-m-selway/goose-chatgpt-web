# Network-error continuation retry-lineage evidence

Status: **ecological evidence supplement for draft PR #31**. No implementation change is authorized by this file.

## Observation — 2026-08-14 ~22:47 CEST

During ordinary Goose + ChatGPT-Web use, the user reported a repeated recovery pattern after Goose surfaced a network error:

1. the user sends a continuation prompt in the same logical Goose chat;
2. Electron opens **two ChatGPT Temporary Chat tabs/surfaces** instead of the expected one;
3. the continuation then crashes/fails;
4. the visible state later collapses back to one reopened ChatGPT surface;
5. that surviving/reopened surface no longer appears connected to the visible Goose chat result path;
6. it repeatedly closes/reopens/retries on its own.

User-provided screenshot evidence at the duplicate-surface phase shows two launcher tabs, `ChatGPT 1` and `ChatGPT 2`, simultaneously present, with one visible on a fresh Temporary Chat composer.

## Classification

This is strong evidence of a **recovery-path settlement / cancellation / retry-lineage problem**, but the exact causal layer is not yet proven.

A leading hypothesis is:

```text
original provider/browser lineage
  -> outer Goose/Responses network error becomes visible
  -> underlying browser/retry lineage remains unresolved

user sends continuation
  -> new provider execution/lease begins
  -> two owned surfaces coexist
  -> one continuation lineage fails/settles
  -> older or detached retry lineage survives
  -> BrowserHost keeps reopening/retrying a surface without a live visible Goose result path
```

Do not treat this diagram as a verdict until trace/session identities are correlated.

The important observed invariant is narrower: **a visible Goose network error does not currently guarantee that the corresponding provider/browser lineage has stopped owning retry/recovery activity before the user can send another continuation.**

## Questions for later trace correlation

For the duplicate-tab and surviving-single-tab phases, determine:

- both surface/tab IDs and their trace IDs;
- which lineage predates the Goose network error;
- which lineage was created by the user's continuation;
- whether the original HTTP/Responses client had already settled/disconnected while browser retry activity continued;
- whether the surviving/reopened surface belongs to the older failed lineage or the newer continuation;
- BrowserHost lease/release and retry events for both traces;
- outer Responses settlement/cancellation state;
- broker/tool continuation state if applicable;
- what condition currently terminates the repeated close/reopen loop;
- whether a supported cancellation would reduce active browser turns to zero without restarting the runtime.

## Architectural implication if confirmed

A later repair may need a narrow **same-Goose-session settlement gate** after outer network/body failure:

```text
outer provider failure visible to Goose
  -> establish prior execution settled/cancelled
  -> only then admit a normal continuation for that same logical session
```

This must not block intentional concurrency such as a parent plus an explicitly delegated child. The gate, if needed, should distinguish:

- expected independent parent/child executions;
- retries within one failed execution lineage;
- a new user continuation in the same parent logical session.

Do not solve this with broad restarts or by simply forbidding multiple BrowserHost surfaces.

## Relationship to other open work

Keep this failure class separate from:

- **stale execution-key replay after BrowserHost recovery** — also PR #31, but a different registry/identity defect;
- **large-context continuation transport** — PR #32; context size may influence some failures, but the duplicate/reopening lineage behavior is independently a settlement/recovery concern;
- **provider-demand BrowserHost startup** — PR #33; the BrowserHost is present and actively opening surfaces here, so this is not a demand-start problem;
- intentional ChatGPT-Web parent/child concurrency.

## Operating posture

Do not manufacture another failure to test this. Preserve naturally occurring timestamps/screenshots and correlate the passive observation corpus when the next focused reliability diagnosis is undertaken.
