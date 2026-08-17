# Large-context continuation — ecological evidence ledger

Status: **design evidence for draft PR #32**. This file does not establish a root cause and does not authorize implementation.

PR #31 remains the authoritative reliability incident ledger. This file only extracts the evidence relevant to the large-context transport hypothesis so the design can be evaluated against both failures and successes.

## Working hypothesis

Each ChatGPT-Web browser turn uses a fresh Temporary Chat and currently replays the complete authoritative Goose context through the ChatGPT composer. As the Goose session grows, a tiny follow-up can therefore become a large browser submission.

Hypothesis: browser-composer transport becomes materially less reliable/efficient as accumulated context grows, and large contexts should eventually be externalized and loaded sequentially through a bounded provider/Goose-Native channel.

This is **not yet a proven causal diagnosis**.

## Negative ecological evidence

Relevant ordinary-use observations already preserved in PR #31 include:

- a same-session continuation failing at browser `send` after a preceding successful turn;
- a severe long-running parent incident followed by continuation attempts at Goose's 80% auto-compaction threshold where compaction/control/send repeatedly failed;
- manually closed Temporary Chat surfaces being recreated while outstanding browser/run lifecycle remained unresolved;
- a natural large-prompt measurement of roughly 21.2 seconds to attach about 24.6k characters versus roughly 2.8 seconds for a shorter successful control;
- user-observed ChatGPT web behavior where sufficiently large pasted text can become a document-like loading/attachment representation and very large compound submissions can become stuck or require refresh.

These observations motivate the design but do not prove that context size caused every failure.

## Positive ecological evidence

On 2026-08-14 a fresh ChatGPT-Web Goose session accepted a substantial first milestone prompt and then accepted a normal follow-up while its accumulated context was still relatively small.

The follow-up remained productive through nontrivial work:

- the parent checkpointed/recovered task state;
- it launched two bounded free-worker strands for `ACP/native-continuation inspection` and `test/contract inventory`;
- tool/write activity remained available;
- when broad file-dump commands were intermittently blocked by the harness, it switched to narrow source queries and structural analysis and continued the critical path.

This is useful positive evidence that ordinary same-session continuation, tool use, checkpointing, and bounded delegation can remain healthy while context is small.

It strengthens the context-size hypothesis by providing a successful comparison point, but **does not prove a threshold or causal relationship**.

The broad file-dump blocking is a separate harness/tool-policy observation unless trace evidence shows otherwise; do not use it as evidence of browser transport failure.

## Explicitly excluded failure class: stale execution-key replay

A separate late-evening incident is now diagnosed:

- BrowserHost was genuinely absent and an initial request received the correct descriptor-missing error;
- BrowserHost was reconstructed and canonical readiness passed;
- later identical requests could still replay the old settled descriptor-missing error from the daemon's per-execution-key registry without leasing BrowserHost;
- a uniquely identified fresh Goose execution succeeded without daemon restart.

That is an execution-key/session-identity defect, **not evidence for the large-context hypothesis**.

Any PR #32 implementation must preserve this invariant:

> A genuinely new Goose/browser turn has new logical execution identity even when its prompt text is identical to an earlier turn.

Prompt-content equality must not reuse an old provider execution key, settled error, retry circuit, or Temporary Chat lineage. Explicit idempotency requires explicit caller-owned identity.

## What evidence would materially strengthen the hypothesis

Prefer ecological/passive measurements before implementation:

- compiled context/prompt characters and estimated tokens per turn;
- prompt attachment duration versus context size;
- send acknowledgement duration versus context size;
- successful and failed continuation outcomes versus accumulated context;
- whether the 80% compaction incident produced especially large browser submissions;
- privacy-safe composer representation/readiness signals around large submissions.

Do not manufacture broad stress merely to populate these measurements.

## Design consequence if the hypothesis continues to hold

Keep the current inline path for small contexts. Above a conservative browser-safe threshold, externalize the exact authoritative Goose context into an immutable provider-owned artifact and load it sequentially through a bounded context-read capability before task execution.

See `chatgpt-web-large-context-externalization.md` for the full proposed architecture and invariants.
