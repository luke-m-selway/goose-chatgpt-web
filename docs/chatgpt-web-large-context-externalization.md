# ChatGPT-Web large-context externalization

Status: design draft / preservation note. No runtime implementation in this branch.

This document captures a design direction discovered during ordinary Goose + ChatGPT-Web use after the Electron/native-liveness work in draft PR #31. It is intentionally separate from PR #31 because PR #31 is the active reliability/observation workstream and is still accumulating ecological incident notes.

## Problem statement

A Goose logical session can remain healthy while its accumulated context grows large enough that every later ChatGPT-Web continuation becomes expensive to transport through a fresh ChatGPT Temporary Chat.

The current ChatGPT-Web transport opens a fresh Temporary Chat for each browser turn. `compileChatGptWebPrompt()` serializes the complete current Goose context into an inline JSON envelope containing the current system/developer/user/assistant/tool-result history, then wraps that envelope in the ChatGPT-Web transport contract. The BrowserWorker then places that compiled text into the ChatGPT composer before sending.

This means a tiny continuation such as `continue` can still require a very large browser-composer payload because Goose owns the authoritative conversation and the bridge replays that authoritative context into the new Temporary Chat.

The current browser path already contains evidence that large inline transport is a special case:

- prompt insertion is chunked into bounded `Input.insertText` operations;
- the source comments explicitly distinguish model-token capacity from ChatGPT composer-character limits;
- the complete composer text is re-read and compared against the expected prompt;
- separate file/image attachments have their own readiness path and wait for ChatGPT to make the message sendable.

Natural usage has also produced context-size-dependent continuation trouble. A same-session follow-up can fail at browser `send` even when the immediately preceding turn completed, while a fresh/small-context request can work. PR #31 contains timestamped ecological breadcrumbs for these incidents; treat them as evidence to correlate, not as a proven root-cause verdict.

The user also observed the ChatGPT web UI converting sufficiently large pasted text into a document-like attachment state with an intermediate loading/spinner state and a later ready state. Independent natural use suggests that giving the ChatGPT web interface too much material in one interactive submission can leave it stuck for an extended period or require a page refresh. Do not assume the exact UI threshold or representation is stable; the architectural concern is the growing amount of state forced through one fragile browser-composer event.

## Design principle

Keep the ChatGPT composer payload small and move large accumulated state through the Goose Native/tool channel sequentially.

The goal is not to change which context Goose gives the model. Goose remains authoritative for session state, compaction, instruction ordering, tool results, and the latest user request. ChatGPT-Web should only change how that already-authoritative context is transported into a fresh Temporary Chat.

Do not solve this primarily by teaching browser automation to tolerate arbitrarily large inline pastes or by increasing attachment/send timeouts.

## Proposed architecture

Small contexts can continue using the current inline transport. Once the compiled browser context exceeds a deliberately conservative browser-safe threshold, externalize the exact compiled Goose context into a provider-owned immutable artifact and send only a small bootstrap prompt through the ChatGPT composer.

Conceptually:

```text
Goose authoritative parsed context
        |
        +-- small enough -----------------> current inline JSON transport
        |
        +-- above browser-safe threshold
                |
                v
        immutable context artifact
                |
                v
        small ChatGPT bootstrap message
                |
                v
        Goose Native first tool call
                |
                v
        bounded sequential context reads
                |
                v
        EOF / complete-context proof
                |
                v
        execute latest Goose request
```

A later continuation therefore remains a small browser submission even when the Goose session is large.

## Context source of truth

Do **not** make ChatGPT-Web scrape Goose's session database or depend on Goose's internal persistence schema.

The provider already has the exact model input Goose intends it to receive in the parsed request. Reuse the same authoritative material currently serialized by `compileChatGptWebPrompt()`.

The external artifact should therefore contain the same logical context envelope the inline transport would otherwise have carried. This preserves:

- system and developer instructions;
- user turns;
- assistant history;
- tool results;
- compaction representation supplied by Goose;
- current/latest user request;
- existing retired broker-handle scrubbing and other transport-safe normalization.

Do not invent a second memory or summarization system in ChatGPT-Web.

## Artifact ownership and storage

Prefer a provider-owned runtime path rather than a project-repo file and rather than direct Goose database access. Example shape only:

```text
<chatgpt-web-runtime-home>/context/
  <session-or-lineage>/
    <trace-or-turn>.json
```

Properties:

- atomically written;
- private permissions (`0600` file, private parent directories);
- immutable for the life of the browser turn;
- addressed by an opaque context ID in the bootstrap contract, not by a caller-controlled arbitrary filesystem path;
- bounded retention/cleanup;
- excluded from Git by being outside the project repository;
- deleted/expired independently of Goose's authoritative session persistence.

The artifact is a transport snapshot, not canonical storage.

## Sequential retrieval

Do not replace one giant composer payload with one giant `cat` tool result. The retrieval path should itself be bounded.

Conceptual contract:

```text
context_read(context_id, offset)
  -> {
       chunk,
       next_offset,
       eof,
       total_chars,
       chunk_index,
       digest
     }
```

The exact names/fields are not decided. The important behavior is:

1. read a bounded chunk;
2. continue from the returned offset;
3. do not begin the requested task while `eof == false`;
4. after complete context has been read, transition into normal task execution.

A purpose-built narrow read primitive is likely cleaner than repeatedly instructing the model to use shell slicing commands, but the first proof may use existing Goose Native file-read/command capabilities if that can be done without oversized tool results.

## Bootstrap state machine

Large-context bootstrap must be explicit enough that the model cannot begin acting after reading only the first portion of context.

Conceptually:

```text
BOOTSTRAP
   |
   v
CONTEXT_LOADING
   |
   | while eof == false:
   |   context-read calls only
   |
   v
CONTEXT_COMPLETE
   |
   v
TASK_ACTIVE
   |
   v
normal Goose Native tools/reasoning
```

The small ChatGPT message should say, in effect:

- this is a continuation of a Goose-owned task;
- the complete authoritative context is represented by the supplied opaque context ID;
- the first action must load it via Goose Native;
- no commentary, answer, or task mutation before complete-context/EOF confirmation;
- preserve the encoded system/developer/user/assistant/tool-result roles exactly;
- after complete loading, execute the latest active user request;
- continue to use the current turn token for normal Goose Native work.

The bootstrap itself should stay nearly constant in size regardless of accumulated Goose history.

## Integrity / ordering

The context artifact is immutable for a turn. Sequential reads should carry enough metadata to make accidental truncation/reordering detectable, for example:

- opaque context ID;
- chunk index;
- current/next offset;
- total character/byte count;
- EOF flag;
- stable digest for the complete snapshot.

The digest is primarily an integrity/debugging aid, not a replacement authorization mechanism.

## Authorization boundary

The context-read path must not become a general filesystem capability.

Prefer:

- context ID created server-side for the current turn;
- mapping from context ID -> exact immutable artifact held by the provider/broker;
- current `turn_token` required on every context-read call;
- no arbitrary caller-supplied path;
- capability expires/revokes with the browser turn;
- existing broker identity/turn isolation remains authoritative.

## Threshold policy

Retain the simple inline path for small contexts. Externalize only when browser transport becomes large enough to create meaningful risk/latency.

The threshold must be based on **browser/composer transport safety**, not merely the model's context window. A context can be comfortably inside the model-token window while still being too large for reliable interactive composer transport.

Do not hard-code the user-observed UI attachment threshold as the architecture. Establish a conservative threshold from ecological traces and controlled implementation validation, with margin below the point where ChatGPT begins expensive or unstable large-text UI behavior.

Useful telemetry for selecting/tuning the threshold:

- compiled prompt/context characters and estimated tokens;
- `prompt_attachment` duration;
- individual insert-chunk timings;
- composer representation/readiness state where privacy-safe;
- send-button readiness;
- `send` acknowledgement duration;
- context size at successful vs failed same-session continuations.

## Why not send the context as a ChatGPT file attachment?

Attaching the large context document directly to the same ChatGPT submission may reduce composer-text pressure, but it still asks the ChatGPT web interface to ingest a large attachment and the task bootstrap simultaneously. Natural use suggests that large/compound interactive submissions are exactly where the web UI can become slow or stuck.

The preferred direction is therefore sequential ingestion through the Goose Native/tool path rather than relying on ChatGPT's browser attachment lifecycle for continuation state.

This also avoids tying core continuation reliability to ChatGPT upload quotas, attachment UI changes, or asynchronous browser-side document preparation.

## Relationship to current large-prompt code

This proposal does not imply that current large-prompt protections are wrong. Existing insertion chunking, exact prompt verification, and attachment readiness remain useful for ordinary inline prompts and for the small-context path.

The proposal removes the requirement that those mechanisms scale with total Goose session size forever.

Do not optimize or delete the current inline path until the externalized path is proven.

## Relationship to Goose compaction

Externalization is complementary to Goose compaction, not a replacement.

Goose decides what authoritative context remains after compaction. ChatGPT-Web externalizes whatever Goose currently supplies. If Goose has compacted early history, the external artifact contains the compacted representation plus surviving current context, exactly as the inline transport would.

This design must not add provider-owned summarization or attempt to resurrect context Goose has intentionally compacted away.

## Capability scope / read-only modes

The initial design naturally fits tool-capable ChatGPT-Web turns because Goose Native is available as the retrieval channel.

Read-only ChatGPT-Web modes do not currently have local Goose Native filesystem/tool access. Do not silently break those modes. Before implementation, explicitly decide whether they:

- retain inline transport up to their existing safe limits;
- gain a narrowly scoped context-read capability that is not a general local-computer bridge; or
- use another provider-owned retrieval transport.

Do not broaden read-only local access accidentally just to reuse the first implementation.

## Minimum implementation slice to investigate later

A future implementation PR should first prove the smallest end-to-end path rather than redesign all prompt handling at once:

1. identify/measure a conservative externalization threshold;
2. externalize the already-compiled authoritative context snapshot above that threshold;
3. create an opaque turn-scoped context ID;
4. send a bounded bootstrap through the normal composer;
5. expose bounded sequential context reads through the existing Goose Native/broker capability boundary;
6. enforce/strongly contract complete loading before task execution;
7. prove the latest user request executes with the same semantics as the existing inline context;
8. preserve the old inline path below threshold;
9. add privacy-bounded telemetry for transport choice, context size, read progression, completion, and failures;
10. validate ordinary same-session continuation with naturally large contexts without manufacturing unrelated browser stress.

## Required invariants

Any implementation must preserve:

- Goose owns logical conversation/session state;
- Goose owns compaction/context lifecycle;
- Goose owns tools/approvals/delegation;
- ChatGPT-Web is a provider/transport beneath Goose;
- no direct dependence on Goose SQLite/session schema;
- no second agent orchestration framework;
- no provider-owned long-term memory;
- no arbitrary filesystem read primitive exposed through the context ID;
- no giant single tool response as a substitute for the giant composer payload;
- no hidden semantic truncation of context;
- no task action before the complete context snapshot has been loaded;
- current small-context behavior remains available until the new path is proven.

## Validation questions

A future implementation/review should answer at least:

- Is the external artifact byte/semantically equivalent to the context the inline compiler would have sent?
- Does a large same-session continuation result in a small browser composer payload?
- Can the model reliably load all chunks in order before acting?
- What happens if a context-read call times out and is retried?
- Can duplicate reads or retries accidentally cause task execution before EOF?
- Does turn cancellation revoke context access and clean up safely?
- Are multiple parent/child turns isolated by distinct context IDs?
- Does a daemon/browser retry reuse the intended immutable snapshot rather than writing a different one under the same ID?
- Are read-only effort modes handled deliberately rather than accidentally widened?
- Does the chosen threshold materially reduce prompt-attachment/send latency and continuation failures in ordinary use?

## PR #31 relationship and evidence handling

Draft PR #31 remains the authoritative Electron liveness/flight-recorder/reliability workstream. It is accumulating timestamped ecological observations from ordinary Goose use, including same-session continuation/send failures and outer Responses/broker events.

Do not move or rewrite those incident notes here. A later implementation should use PR #31 and the passive observation corpus to test whether large context replay actually correlates with the failures.

This design PR exists to preserve the architectural response if that hypothesis continues to hold: **avoid forcing accumulated Goose state through one ever-growing ChatGPT browser submission; externalize it and load it sequentially through a bounded, turn-scoped Goose Native context channel.**
