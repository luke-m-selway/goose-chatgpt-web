# Runtime lifecycle and macOS autostart

Status: **current/proven** for the existing manually reconstructed runtime; the actual reboot/login autostart proof has now been **RUN and FAILED / NOT QUALIFIED**. The integrated single-application lifecycle below is **planning/design direction only** until implemented and qualified.

Current activated local diagnostic checkpoint: `0b89d5ecb912a2977d0bf60d9c3a8fa53ac5cad6` (`0b89d5e`).
Qualified behavioral baseline beneath it: `6d4bea17fb3de3cb770cb3d4f21fd31b49019dc8` (`6d4bea1`).

The PR #35 documentation branch does not contain that local implementation lineage and must not be used to overwrite or reconcile `fix/electron-native-liveness`.

## Current/proven ownership

The currently deployed standalone Goose runtime still has three separately owned infrastructure layers:

1. **Secure MCP Tunnel** — independently supervised outbound connector/tool runtime.
2. **Electron BrowserHost** — authenticated browser/surface owner.
3. **Responses daemon** — independently supervised loopback Responses provider and browser-helper owner.

Goose remains outside that infrastructure ownership tree and owns durable logical session/history, tools/approvals, delegation, project execution and context/compaction lifecycle. ChatGPT browser chats remain disposable transport/cache state.

This description is current implementation truth, **not a permanent architecture mandate**. The earlier instruction that Electron must never own daemon/tunnel supervision is superseded as a design constraint.

## Current canonical lifecycle

Existing startup:

```text
Secure MCP Tunnel ready
  → Electron BrowserHost genuinely ready
    → Responses daemon ready
```

Existing shutdown:

```text
Responses daemon
  → Electron BrowserHost
    → Secure MCP Tunnel
```

The existing operator path remains:

```bash
codex-chatgpt-web lifecycle <status|start|restart|stop>
```

until an integrated replacement is implemented and qualified.

## Existing BrowserHost readiness contract

For the current stack, usable BrowserHost readiness remains stronger than PID/descriptor/CDP existence. The canonical existing path leases a disposable surface, verifies it through the descriptor-provided Node/Electron Node helper with `ELECTRON_RUN_AS_NODE=1`, releases the lease in `finally`, and confirms BrowserHost usability again.

Do not weaken this current proof merely because the future ownership model may change. Equivalent or stronger readiness evidence is required before cutover.

## Actual reboot/login proof — RUN, FAIL / NOT QUALIFIED

A full macOS reboot/login was performed on 2026-08-24.

Observed result:

- automatic ChatGPT-Web infrastructure reconstruction did **not** occur;
- manual canonical bring-up was required;
- manual post-reboot bring-up succeeded and restored healthy daemon/tunnel/BrowserHost with stable idle `0/0` active turn counts;
- exact active checkpoint was `0b89d5e`;
- independent pre-turn raw DevTools baseline was healthy (`/json/version` total ~17.3 ms; raw WS connect ~46.2 ms; `Browser.getVersion` ~4.86 ms; total ~51.1 ms);
- the first post-reboot manual ChatGPT-Web High run showed dramatically healthier startup/control behavior and completed substantial real Goose Native work, but later surfaced `chatgpt_retry_circuit_open` after an unresolved causal failure.

Therefore the old status **`actual reboot/login reconstruction is NOT RUN` is false**. Do not replace it with PASS. The correct lifecycle verdict is **RUN — automatic reconstruction FAILED / NOT QUALIFIED; manual reconstruction PASSED**.

The reboot materially improved one severe startup/control episode but did not prove ChatGPT-Web fixed; multiple failure classes remain plausible.

## Governing lifecycle redesign direction — not yet implemented

The architectural priority is now:

```text
one ChatGPT-Web application
one top-level owner
one restart boundary
one readiness contract
```

The intended normal UX is:

```text
open Goose
open ChatGPT-Web application
  → ChatGPT-Web internally starts/supervises what it needs
  → provider appliance reaches READY
```

The ChatGPT-Web application may still use separate child processes internally where useful, including the Responses endpoint, browser worker/helper, MCP server and secure tunnel. The requirement is one clear **top-level application owner**, not one OS process.

The stable replaceability boundary moves upward: Electron is today's implementation of the ChatGPT-Web provider application; if Electron later proves unsuitable, replace the application behind the same Goose-facing provider contract rather than keeping every internal component independently operator-owned.

Resource minimisation/demand-start is secondary. Lazy startup of Chromium or expensive children is welcome only when it remains simple inside the single-owner lifecycle. It must not reintroduce cross-owner coordination, special recovery paths, or weaken `open ChatGPT-Web → provider appliance READY`.

## Parallel, rollback-capable migration constraint

Do **not** tear down the existing `0b89d5e` provider path in place while building the integrated mode.

Required migration posture:

```text
existing provider path        remains available
         │
         ├── current known-good/diagnostic baseline
         │
new integrated app path       developed alongside it
```

Qualification order for the integrated path:

1. app starts all required internal infrastructure;
2. health/readiness passes;
3. ordinary read-only ChatGPT-Web turn passes;
4. Goose Native/tool-capable turn passes;
5. continuation/multi-turn passes;
6. quit/reopen reconstruction passes;
7. only then make integrated mode the normal path;
8. retain the old path briefly as rollback;
9. delete independent-supervision machinery only after the replacement is proven.

Development may be substantial, but ChatGPT-Web must not require prolonged unavailability. Downtime should be limited to bounded qualification/cutover windows.

## Self-interference and non-regression rules

- Never qualify stop/restart behavior from a turn that depends on the exact runtime being stopped.
- Preserve original causal failures rather than replacing them with later retry/cleanup symptoms.
- Preserve exact-once send, semantic reconciliation, typed error classification, progress/liveness, retry-claim and terminal-retirement guarantees through ownership changes.
- Timeouts remain safety nets, not normal lifecycle control flow.
- Do not delete the current rollback path until the integrated path has passed the explicit gates above.
