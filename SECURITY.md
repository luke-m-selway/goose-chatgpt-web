# Security policy

Do not open public issues containing ChatGPT cookies/browser storage, tunnel IDs or keys, Goose prompts/tool results, browser-host descriptors/tokens, or private local filesystem paths. Redact diagnostic bundles before sharing them.

The provider/BrowserHost infrastructure binds its local control surfaces to loopback, but another malicious process running as the same OS user is inside the practical trust boundary. Treat browser session state, tunnel credentials, and lifecycle-control tokens as sensitive.

Read the complete [security model](docs/security-model.md) before enabling full mode. In particular, full mode allows an untrusted ChatGPT response to request tools from the active Goose turn; Goose remains responsible for its own tool registry, sandboxing, approvals, command execution, and delegation policy.

Do not broaden connector permissions or silently migrate cached connector identities in order to make a blocked action work. The current connector contract is `Goose Native`; legacy connector/action identities are migration debt and must fail closed when they cannot be migrated safely.

The stable MCP dependency graph may include HTTP-server code that this project does not use directly. Keep `bun audit`, protocol tests, and release smoke tests as gates and remove dependency overrides only after the upstream dependency actually no longer requires them.

Once private vulnerability reporting is enabled for the repository, use that channel for issues involving credentials, authentication state, arbitrary local tool execution, or lifecycle-control bypasses. Until then, contact the repository maintainer privately rather than publishing a working exploit or sensitive diagnostic material.
