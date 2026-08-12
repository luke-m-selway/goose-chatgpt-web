# ACP main-agent multi-turn control case

Status: **diagnostic evidence for PR #29; documentation only.**

Captured from operational Goose use on **2026-08-13**.

## New discriminator

Ordinary Goose sessions using an **ACP main agent can successfully handle multiple user turns in the same persisted Goose chat**.

That provides an important control case:

```text
Goose persisted session
  → ACP main agent
  → turn 1
  → turn 2
  → later turns
  → works
```

while the ChatGPT-Web main-provider path remains:

```text
Goose persisted session
  → custom ChatGPT-Web Responses provider
  → standalone-Goose request adaptation
  → ChatGPT-Web browser/provider lifecycle
  → turn 1 works
  → ordinary later user turn fails
```

## Fault-boundary consequence

Do **not** treat Goose persisted-session or ordinary user-facing multi-turn continuation machinery itself as a leading root cause without new contradictory evidence.

The failing common path across managed Chrome and Electron is more narrowly the **ChatGPT-Web provider/adapter path**, including its standalone-Goose identity, browser-turn/session ownership, Goose Native capability lifetime, and retry/replay behavior.

This strengthens the value of comparing the same Goose session semantics through two provider classes:

```text
control:
Goose session → ACP provider/agent → turn N+1 succeeds

failure:
Goose session → ChatGPT-Web provider → turn N+1 fails
```

The ACP path does not need to be reverse engineered as a new implementation target. Its value is to prove that Goose can persist and advance the conversation correctly and to narrow inspection to the provider-specific translation/lifecycle boundary.

## Updated diagnostic priority

For the continuation investigation, first compare what the ChatGPT-Web provider receives/derives on user turn 1 versus user turn 2:

- structural Goose session identifier, if supplied;
- request input/history shape;
- standalone synthetic thread/turn identity;
- user-revision/execution key;
- whether an older browser/provider turn from the same Goose lineage remains active or registered;
- Goose Native token/binding creation and revocation;
- retry classification and any re-submission after a post-send failure.

The leading architectural question remains whether the provider needs **same-Goose-lineage superseded-turn retirement** before starting the next genuine user turn, while preserving unrelated concurrent Goose/child turns.

## Qualification implication

A future fix should use an ACP main-agent multi-turn run as a control alongside the ChatGPT-Web test. The target is not merely that Goose can resume generally; that is already demonstrated by ACP. The target is that the ChatGPT-Web provider matches Goose's already-working multi-turn semantics without sacrificing independent Electron concurrency.
