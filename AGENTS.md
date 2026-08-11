# Agent safety notes

These instructions apply to coding/automation agents working in this repository.

- Preserve ignored `.env` files, browser authentication state, runtime keys, credentials, and unrelated local proof artifacts unless the task explicitly authorizes changing them.
- Never print, log, commit, or otherwise expose credentials or authentication material.
- Do not enumerate macOS Keychain contents or use broad discovery commands such as `security dump-keychain`. Repository/configuration discovery must not inspect unrelated credentials.
- If a task genuinely requires a Keychain item, access only the exact known service/account entry needed for that task; otherwise prefer the project's existing private managed files or an ignored `.env`/process environment for local configuration.
- Do not use broad process-kill commands for Chrome/Playwright. Target only a known project-owned process when a test explicitly requires it.
- Any agent running as the current Goose main agent must never restart, quit, upgrade, relaunch, terminate, or otherwise disrupt the Goose application/process that is hosting its own session. Doing so destroys the transport/session carrying that agent.
- Host-Goose lifecycle operations must be performed by the user or by a separate external agent/session that is not hosted by the Goose instance being changed. A current Goose main agent may restart explicitly authorized project-owned child services such as the `goose-chatgpt-web` daemon when that action cannot terminate its own Goose host/session; otherwise it must stop and ask for the host-level action to be performed externally.
