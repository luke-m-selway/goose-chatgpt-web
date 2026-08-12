# Historical documentation index

This directory is for **retired or superseded architecture only**. Nothing here is an operator instruction.

The project accumulated a detailed chronological roadmap while the browser transport, tool bridge, and outer-harness ownership were still changing quickly. That record remains valuable for archaeology, but leaving it mixed into current documentation made old assumptions look operationally valid.

## Exact pre-cleanup snapshot

The complete documentation state immediately before this cleanup is preserved by Git at commit:

`76941119f33ec359c1d4b4b47f4d5c7df5b91c74`

Use that revision when investigating why a historical decision was made. Do not copy commands from it into a current runtime without rechecking the current architecture.

In particular, that snapshot preserves:

- the long chronological roadmap and its individual proof milestones;
- the managed-Chrome transport work and focus-minimization fallback;
- earlier connector/tool naming;
- the inherited desktop-launcher ownership model;
- transition-period documentation in which two possible outer harnesses were described together.

## Retired systems and concepts

### Managed Chrome as the primary BrowserHost

Managed Chrome proved the initial Goose → ChatGPT-Web provider architecture and remains useful as fallback/reference code. It is no longer the target primary browser architecture. Current development targets the Electron BrowserHost because it provides an authenticated persistent partition, exact task-bound surfaces, explicit control/CDP ownership, and a path to deterministic supervision without ordinary Chrome focus theft.

Historical managed-Chrome recovery findings remain useful when reasoning about stale connections, but managed-Chrome launch/restart commands are not the Electron operating contract.

### Inherited launcher-owned runtime

The inherited desktop architecture allowed one launcher application to supervise more of the runtime stack. Standalone Goose intentionally split that ownership:

- Electron owns BrowserHost only;
- the Responses daemon is independent;
- the Secure MCP Tunnel is independent;
- Goose owns the logical agent session and tools.

Any historical instruction that lets Electron adopt, restart, or stop the standalone daemon/tunnel is superseded.

### Legacy connector and action identities

Older connector/action identities are retained only for migration archaeology. The current public connector identity is `Goose Native`; current naming policy is in [`../naming.md`](../naming.md).

### Chronological roadmap as source of truth

The old roadmap was useful as an engineering diary, but a completed milestone from an older architecture is not necessarily a current invariant. The active [`../roadmap.md`](../roadmap.md) is now intentionally short and links here for history.

## Deferred work is not history

Deferred proposals are different from retired designs: they may still be implemented later, but they are not current runtime behavior. Keep them in clearly marked draft PRs/documents rather than mixing them into this directory.

Current deferred examples include Goose Control and future browser-host/control-plane optimization.
