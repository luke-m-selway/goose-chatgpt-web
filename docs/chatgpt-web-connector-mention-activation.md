# ChatGPT-Web connector activation via `@` mention

Status: **near-future reliability fix candidate** for draft PR #31. Documentation/design only; no runtime behavior changes are made here.

## Why this is worth doing

The current ChatGPT-Web browser path explicitly opens the ChatGPT tools/app menu and clicks the `Goose Native` connector item before sending the task. Natural runs on 2026-08-15 have repeatedly failed at that exact pre-turn UI step:

- Playwright resolved the `Goose Native` menu item and then observed it detach during a ChatGPT UI rerender;
- later fresh runs timed out for ~10 seconds waiting for the same connector item to become usable;
- failed pre-turn executions could remain retained/retrying and amplify into replacement-surface churn until the supported `service cancel-turns` recovery cleared them.

This is an avoidable reliability dependency if ChatGPT's normal `@Connector name` activation path can be used instead.

## User-confirmed product behavior

In ordinary ChatGPT Web use, typing:

```text
@Goose Native
```

loads/activates the `Goose Native` connector without manually opening and clicking the tools/app dropdown.

Treat this as strong product-level evidence and a candidate simplification, but still qualify the exact automated behavior in the Electron/BrowserHost path before deleting the existing menu-selection code.

## Preferred near-term direction

Replace explicit pre-send menu navigation/clicking with prompt-level connector activation using the normal ChatGPT mention syntax.

Conceptually:

```text
current
  open tools/app menu
  -> locate transient Goose Native menu item
  -> click it
  -> verify selection
  -> attach/send task

candidate
  prepare composer
  -> insert/resolve @Goose Native through the normal composer interaction
  -> deterministically verify Goose Native is activated
  -> append/attach the existing task payload
  -> send
```

The goal is to **delete a fragile UI surface**, not merely move the same selector race elsewhere.

## Qualification requirements

Before replacing the current path, prove with the existing Electron/BrowserHost architecture that:

1. a fresh Temporary Chat can activate `Goose Native` from `@Goose Native` without opening the tools/app dropdown;
2. activation is deterministic and can be positively verified before task send;
3. the mention does not become ordinary prompt text when activation fails;
4. the existing Goose Native tool contract, turn-token authority, permissions, and tool availability are unchanged;
5. long/structured task payload insertion still works after connector activation;
6. repeated fresh sessions do not inherit stale activation state;
7. failure settles cleanly and cannot silently send a task without the connector;
8. focused regression tests cover connector activation and failure classification.

Run only a small number of harmless fresh-session proofs. Do not use same-session continuation as part of this qualification.

## Implementation preference

Prefer the smallest supported UI-semantic implementation that mirrors normal user behavior. Do not reverse-engineer or depend on undocumented private ChatGPT backend endpoints merely to avoid the menu.

If `@Goose Native` activation proves reliable, remove the explicit dropdown/menu-selection path rather than retaining two normal activation mechanisms. A narrow fallback may be kept temporarily during qualification only if required for rollback evidence.

Do not solve this by globally raising Playwright timeouts or adding broad blind retries.

## Relationship to current incidents

This candidate addresses the recurring **pre-turn connector-selection race**. It does not itself solve the separate retained-turn/retry amplification defect that can turn one pre-turn failure into repeated replacement surfaces. That amplification path should still be hardened independently so any future UI failure settles safely.

The existing out-of-band runtime recovery procedure remains the operational escape hatch:

```text
codex-chatgpt-web service cancel-turns
```

followed by proof that active browser/HTTP turns remain at zero and runtime health is restored.

## Near-future order

1. finish/record the currently active narrow selector incident if useful;
2. qualify `@Goose Native` activation in one fresh Electron/BrowserHost session;
3. if deterministic, replace and delete the dropdown-click activation path;
4. add regression coverage;
5. separately harden retained-turn amplification so a single pre-turn failure cannot spin out into repeated replacement surfaces.

This should be treated as a high-value simplification because it removes an unstable ChatGPT menu interaction from every ChatGPT-Web turn while preserving the normal ChatGPT connector model.