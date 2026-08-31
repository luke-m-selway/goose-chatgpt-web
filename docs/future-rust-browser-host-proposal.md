# Future Rust browser-host proposal

**Status:** deferred architecture proposal / research note only. **Do not implement during the current Electron/browser-host migration.**

**Recorded:** 2026-08-11.

This note preserves a future optimization idea for `goose-chatgpt-web`: once the Electron browser transport is implemented, qualified, and measured, investigate whether more of the transport/control plane should move to Rust and whether Electron should remain the browser host.

The motivating intuition is reasonable but needs an important correction: Rust/Tauri can provide a smaller, more native host than Electron, but for this project Electron is not merely a GUI framework. It is also the project’s controlled Chromium runtime. Replacing Electron with Tauri would therefore change the browser engine and automation boundary, not just the implementation language.

The current conclusion is **not “replace Electron with Tauri.”** The future question should be broader:

> Can `goose-chatgpt-web` move more of its lifecycle/control plane into Rust, closer to Goose, while preserving or improving the controlled-browser properties that make the Electron transport reliable?

Tauri should be evaluated as one candidate, alongside retaining Electron as a narrow Chromium appliance and exploring a Rust-managed controlled-Chromium host.

---

## 1. Why this is worth revisiting later

Goose is primarily implemented in Rust and describes itself as built in Rust for performance and portability. `goose-chatgpt-web` currently has substantial TypeScript/Node/Electron machinery around the browser transport.

A Rust control plane could be attractive for components whose correctness depends on explicit lifecycle and concurrency semantics, for example:

- process supervision;
- leases and ownership;
- helper lifecycle;
- heartbeats and bootstrap deadlines;
- cancellation and timeouts;
- IPC/protocol types;
- deterministic cleanup;
- state-machine transitions;
- launcher/runtime supervision;
- session and capability metadata shared with Goose.

Rust could also make later code sharing or crate-level integration with Goose more natural than a Node-only control plane.

However, changing implementation language should not be treated as an optimization by itself. The browser runtime remains the dominant functional dependency because ChatGPT Web requires a fully capable modern browser. Any future migration must be justified by measured resource, reliability, maintainability, or integration gains.

---

## 2. Current Electron target and why it fits the problem

The current target architecture is approximately:

```text
ordinary Goose
  -> custom ChatGPT-Web Responses provider
  -> launcher-supervised standalone goose-chatgpt-web daemon
  -> ChatGptTurnSession / TurnBroker
  -> LauncherBrowserHelperClient
  -> isolated helper process
  -> launcher turn lease/control
  -> exact Electron WebContentsView
  -> private loopback CDP
  -> ChatGPT Temporary Chat
```

The upstream Electron/browser-host design is valuable because Electron provides a known Chromium runtime and first-class control over `WebContents` / `WebContentsView`.

The transport can therefore build a strong ownership chain:

```text
launcher-issued surfaceId
  -> exact Electron WebContentsView / WebContents
  -> exact Chromium/CDP target
  -> helper / Playwright attachment
  -> one owned ChatGPT page
```

Electron exposes Chrome DevTools Protocol target identity for `WebContents`, which aligns well with the exact-surface ownership model being ported from upstream.

This is materially different from using Electron as a generic desktop UI shell. In this project, Electron currently supplies three things at once:

1. a persistent browser-host process;
2. a controlled Chromium version and profile/session environment;
3. an exact automation/inspection boundary through Chromium/CDP.

Any proposed replacement must preserve or improve those properties, not merely reduce application size.

---

## 3. Tauri: what would improve

Tauri uses a Rust core and HTML rendered in the operating system’s WebView rather than bundling its own browser engine. This gives it several potential advantages.

### 3.1 Smaller application footprint

Tauri applications can be much smaller because they reuse the OS WebView and compile the Rust backend into the application instead of shipping Chromium and Node with every app.

For `goose-chatgpt-web`, this could reduce:

- packaged application size;
- some idle host-process memory;
- Node/Electron runtime overhead;
- JavaScript dependency/runtime surface in the control plane.

The actual active-turn memory improvement must be measured rather than assumed, because ChatGPT Web itself still requires a browser renderer, JavaScript engine, networking stack, storage, DOM, and significant page state.

### 3.2 Rust-native control plane

Tauri’s Rust backend would be a natural environment for typed lifecycle code, supervision and IPC. This could improve maintainability and make invalid lifecycle states harder to express.

For example, the browser surface lifecycle could be represented explicitly as typed states rather than loosely structured JavaScript objects:

```text
Allocated
  -> Bootstrapping
  -> Owned(helper_pid)
  -> Active
  -> Terminal
  -> Released
```

The same applies to helper ownership, turn leases, bootstrap expiry, heartbeat expiry and terminal cleanup.

### 3.3 Closer architectural alignment with Goose

A Rust implementation could eventually share types, protocol crates, capability descriptions or common lifecycle primitives with Goose where doing so genuinely reduces duplication.

This would not happen automatically merely by adopting Tauri. A separate Tauri app is still a separate process. The integration benefit would come from intentional shared Rust crates or moving appropriate transport/control code closer to Goose’s Rust architecture.

### 3.4 Potentially smaller Node/JavaScript failure surface

Moving the non-browser control plane to Rust could reduce Node-specific process/runtime complexity and dependency churn. This is potentially valuable for long-running supervision code.

Again, this should be treated as an engineering hypothesis to test, not as a blanket claim that Rust is always faster or more reliable than JavaScript.

---

## 4. Tauri: what would get worse or require major redesign

This is the central reason Tauri should not be treated as the predetermined successor to Electron.

### 4.1 Tauri normally uses the OS WebView, not one controlled Chromium runtime

Tauri currently uses different WebView implementations by platform:

```text
Windows -> Microsoft Edge WebView2
macOS   -> WKWebView
Linux   -> WebKitGTK
```

That is excellent for small native applications, but it changes the core browser assumption of the current transport.

Electron instead gives the project a consistent Chromium runtime across platforms.

For `goose-chatgpt-web`, consistency matters because transport reliability depends on exact browser behavior, session storage, DOM interaction, automation and lifecycle ownership.

### 4.2 macOS would stop being Chromium/CDP

On macOS, a Tauri implementation would normally use `WKWebView`.

The current transport is converging around Chromium + CDP + Playwright/helper attachment. WKWebView is not a Chromium CDP target.

A direct Electron -> Tauri replacement could therefore require replacing or substantially redesigning:

```text
Playwright connectOverCDP()
exact Chromium target selection
Chromium DevTools target identity
parts of browser-helper attachment
parts of existing prompt/DOM automation assumptions
```

Possible replacements might involve WebKit-specific inspection/automation, injected scripts, WebDriver-style automation or platform-specific APIs. That would be a major browser-transport rewrite rather than a simple host migration.

### 4.3 Cross-platform behavior would become less uniform

Electron target:

```text
macOS   -> Chromium
Windows -> Chromium
Linux   -> Chromium
```

Tauri target:

```text
macOS   -> WebKit / WKWebView
Windows -> Chromium-based WebView2
Linux   -> WebKitGTK
```

Tauri’s own documentation warns that using OS WebViews means platform differences must be considered.

That is particularly relevant for a project whose hardest problem has been browser/session reliability. A future migration should avoid replacing one controlled browser behavior with three platform-specific behavior sets unless the benefit is compelling and proven.

### 4.4 Browser-version control would change

Electron ships a known Chromium runtime with the app, giving the project direct control over the browser version used by the transport.

Tauri relies on the OS WebView runtime. This reduces bundle size and can improve security-update cadence, but it also means browser behavior is partly determined by OS/runtime versions outside the project’s release artifact.

For automation of a fast-changing external web application such as ChatGPT, deterministic browser-version control can be operationally valuable.

### 4.5 Persistent isolated authentication/session behavior is less uniform

The current Electron architecture deliberately owns a persistent isolated Electron authentication partition.

Tauri has WebView data storage controls, but they are platform-specific. For example, its generic custom data-directory behavior differs on macOS, where WKWebView uses a data-store identifier mechanism instead, and that mechanism has OS-version requirements.

A Tauri proof would therefore need to demonstrate an equally strong replacement for:

- isolated persistent ChatGPT authentication state;
- deterministic import/login behavior;
- cleanup of partial state;
- multiple logical browser surfaces without state confusion;
- restart persistence;
- privacy boundaries between maintenance/login and normal turns.

### 4.6 It would discard substantial reusable upstream engineering

The current `codex-chatgpt-web` upstream has already invested heavily in Electron-specific reliability:

- BrowserHost lifecycle;
- exact `surfaceId` ownership;
- exact page selection;
- helper PID ownership;
- turn heartbeat;
- separate bootstrap expiry;
- stale-owner replacement;
- orphan cleanup;
- terminal surface release;
- helper-backed verify/inspect/smoke;
- Electron login/session import;
- controlled Chromium/CDP attachment.

The current Goose migration can reuse and adapt that engineering.

A Tauri migration would turn much of it into design reference material rather than directly reusable implementation.

---

## 5. Performance expectations should be measured, not assumed

A normal Electron -> Tauri rewrite can produce a very large package-size reduction because Tauri does not bundle a browser engine.

For this project, however, the workload still requires a modern browser rendering ChatGPT Web. The expensive browser-side components do not disappear merely because the host changes:

```text
ChatGPT Web application
+ browser renderer
+ JS engine
+ DOM/layout
+ networking
+ cache/storage
+ automation/inspection
```

Therefore the likely gains are:

- large package-size reduction if Electron/Chromium is fully removed;
- lower host/runtime overhead;
- potentially lower idle memory;
- potentially simpler/native control-plane integration.

But a dramatic reduction in **active ChatGPT turn memory** should not be assumed. Measure it.

Likewise, Rust should not be adopted simply because it is Rust. The useful question is whether Rust produces measurable improvements in lifecycle correctness, maintainability, resource use or Goose integration for this particular architecture.

---

## 6. More promising future option: Rust control plane + Electron browser appliance

A potentially stronger intermediate architecture is to move the control plane toward Rust **without replacing the browser host immediately**.

Conceptually:

```text
Current target

Goose (Rust)
  -> TypeScript/Node goose-chatgpt-web daemon
  -> Electron BrowserHost
  -> Chromium
  <-> CDP / helper / Playwright
```

Possible future:

```text
Goose (Rust)
  -> Rust goose-chatgpt-web transport/control daemon
  -> narrow Electron BrowserHost appliance
  -> Chromium
  <-> CDP / helper / Playwright
```

Electron could then become deliberately small in responsibility:

```text
"Create and own a Chromium surface.
Keep this authenticated partition alive.
Expose the exact owned target.
Report lifecycle/failure events.
Release it deterministically."
```

The Rust side could own most of the system logic:

- logical provider/transport protocol;
- daemon lifecycle;
- launcher supervision;
- lease state machine;
- helper supervision;
- cancellation/deadlines;
- health and liveness;
- capability/session metadata;
- typed IPC contracts;
- observability.

This preserves the strongest property of the current design — controlled Chromium with exact CDP target ownership — while moving the non-browser orchestration closer to Goose’s implementation ecosystem.

This is currently the most interesting future optimization candidate.

---

## 7. Longer-term option: Rust + controlled Chromium without Electron

A later research track could ask whether Electron itself can be replaced while **retaining a controlled Chromium runtime**.

Conceptually:

```text
Goose (Rust)
  -> Rust ChatGPT-Web provider/control daemon
  -> Rust-managed controlled Chromium host
  -> Chromium
  <-> CDP
```

Potential implementation families to investigate at that future date include:

- Chromium embedding frameworks;
- a minimal dedicated Chromium host process;
- an externally managed Chromium instance with strong ownership and isolation;
- another maintained Rust-compatible browser-host layer.

Do not choose a specific technology now. Browser embedding projects, maintenance status, licensing, platform support and automation capabilities can change substantially.

The acceptance requirement is architectural, not brand-specific:

> preserve exact browser-surface ownership, isolated persistent auth, controlled browser behavior and reliable automation while reducing complexity/resource cost or improving Goose integration.

This option has the highest potential architectural payoff but also the highest rewrite and maintenance cost.

---

## 8. Candidate future comparison

Treat this table as a hypothesis to validate after Electron is stable, not as benchmark evidence.

| Candidate | Expected host efficiency | Browser consistency / automation fit | Potential Goose/Rust integration | Rewrite cost |
| --- | --- | --- | --- | --- |
| Electron target | medium | very high | medium | baseline |
| Tauri + OS WebView | high | low-to-medium for this CDP-oriented transport | high | high |
| Rust control plane + narrow Electron host | high | very high | very high | medium |
| Rust + controlled Chromium host | high | potentially very high | very high | very high |

The likely near-term favorite for a future experiment is **Rust control plane + narrow Electron host**, because it preserves the browser behavior already being made reliable while testing whether Rust meaningfully improves the surrounding system.

Tauri remains a valid candidate, particularly if future ChatGPT automation no longer depends strongly on Chromium/CDP or if Tauri/WRY gains a browser-control path that meets the same ownership requirements.

---

## 9. Required sequencing

Do not start this work during the current Electron migration.

### Stage A — finish and qualify Electron

First establish the Electron/browser-host architecture as a reliable baseline.

Required evidence should include at least:

- reliable multi-prompt ChatGPT-Web operation;
- exact surface ownership;
- deterministic terminal release;
- robust helper failure/restart behavior;
- login/auth persistence;
- browser restart recovery;
- controlled fallback behavior;
- acceptable tool/delegation round trips through Goose.

### Stage B — measure the real Electron baseline

Record representative measurements rather than relying on framework reputation.

At minimum:

- packaged app size;
- cold launch time;
- idle RAM after login;
- RAM during an active turn;
- RAM during tool-heavy long turns;
- CPU while idle;
- CPU during prompt/response automation;
- number/process types while idle and active;
- browser crash/recovery rate;
- turn success rate;
- login/session recovery rate;
- helper restart rate;
- maintenance burden / transport-specific defects.

Measure on the actual supported hardware/OS combinations, especially the primary macOS environment.

### Stage C — isolate what Rust would actually replace

Before choosing Tauri or another browser host, decompose current Node/Electron responsibilities into:

1. browser-engine responsibilities;
2. browser-host lifecycle responsibilities;
3. provider/transport control-plane responsibilities;
4. helper/automation responsibilities;
5. launcher/setup/login responsibilities.

Identify which components can move to Rust without changing browser behavior.

### Stage D — prototype the lowest-risk Rust boundary first

Prefer a small proof such as:

```text
Rust supervisor/control process
  -> existing Electron BrowserHost
```

Prove typed IPC, lifecycle, surface leasing and cleanup against the existing browser host before attempting a browser-engine replacement.

### Stage E — only then compare browser-host alternatives

Use the same qualification suite against:

- Electron + Chromium;
- Tauri + OS WebView;
- Rust + controlled Chromium;
- any other credible candidate available at that time.

Do not compare only launch time or package size. Browser/session reliability and automation correctness are first-class metrics.

---

## 10. Acceptance criteria for replacing Electron

A future replacement should not proceed unless it is demonstrably better overall.

At minimum it must preserve or improve:

### Browser correctness

- authenticated ChatGPT Temporary Chat operation;
- prompt insertion reliability;
- response observation;
- tool-call continuation;
- long-prompt behavior;
- changing ChatGPT DOM resilience.

### Ownership/lifecycle

- exact surface identity;
- exact automation target identity;
- bounded acquisition;
- helper/process ownership validation;
- heartbeat and bootstrap deadlines;
- stale-owner handling;
- orphan cleanup;
- deterministic terminal release;
- deterministic restart recovery.

### Session/auth

- persistent isolated authentication state;
- safe login/import path;
- cleanup of failed imports;
- no accidental browser-history ownership of Goose conversation state.

### Platform behavior

- supported macOS behavior first;
- no unacceptable divergence across Windows/Linux if cross-platform support remains a goal;
- deterministic enough browser/runtime version behavior for support and debugging.

### Resource/maintenance benefit

At least one meaningful improvement should be measured, for example:

- materially lower idle memory;
- materially lower active memory;
- materially smaller distribution;
- faster launch/recovery;
- fewer transport defects;
- substantially simpler lifecycle code;
- meaningful code sharing/integration with Goose;
- lower maintenance burden.

A rewrite that only makes the host “more Rust” without measurable system benefit is not sufficient.

---

## 11. Tauri-specific proof requirements

If Tauri is later tested, the proof must answer these questions before broader implementation:

1. Can the macOS WKWebView path reliably automate ChatGPT Web without the existing Chromium/CDP assumptions?
2. What replaces exact CDP target identity and `connectOverCDP()`?
3. Can the system prove exact ownership of one WebView/page equivalent to the current `surfaceId -> WebContents -> CDP target` chain?
4. Can it preserve isolated persistent ChatGPT authentication on every supported OS?
5. How does hidden/background throttling affect long ChatGPT turns?
6. Does ChatGPT/Cloudflare treat the platform WebViews differently from Electron Chromium?
7. Are prompt insertion, Temporary Chat detection and DOM automation equally reliable?
8. How different are macOS, Windows and Linux implementations in real maintenance effort?
9. Does the measured resource saving remain meaningful while ChatGPT is actively loaded?
10. Does the Tauri implementation reduce total system complexity after replacing the CDP-specific machinery it invalidates?

Failure on these questions should favor retaining Chromium rather than forcing Tauri adoption.

---

## 12. Rust/Goose integration questions to revisit

A future Rust migration should also consider whether `goose-chatgpt-web` should remain a standalone provider daemon or share more code with Goose.

Questions for that future design pass:

- Can provider protocol types be shared as a Rust crate without coupling release cycles too tightly?
- Can lifecycle/health types be reused by Goose without making Goose aware of browser implementation details?
- Should launcher supervision remain separate from the provider daemon?
- Is a Rust daemon sufficient, or is direct in-process Goose integration actually beneficial?
- How should crashes in the browser appliance be isolated from the Goose process?
- Which components benefit from Rust ownership and which are best left browser-adjacent in JavaScript?

Preserve the existing architectural principle that Goose owns logical conversation, tools, approvals, delegation and execution while the browser transport owns only model/browser transport concerns.

Do not move browser history or browser UI into ownership of Goose logical session state merely because more code becomes Rust.

---

## 13. Anti-goals

This proposal does **not** authorize:

- replacing the Electron work currently in progress;
- starting a Tauri rewrite;
- adding Rust to the current milestone merely for language consistency;
- abandoning upstream `codex-chatgpt-web` Electron improvements;
- changing the current login/browser transport before Electron qualification;
- modifying Goose itself;
- coupling `goose-chatgpt-web` directly into Goose’s process without a separate architectural review;
- choosing CEF, Tauri, WRY or another browser framework today;
- optimizing package size at the expense of transport reliability;
- assuming Rust automatically improves performance without measurements.

---

## 14. Reassessment trigger

Reopen this proposal only after the Electron/browser-host transport is materially reliable and one or more of these conditions are true:

- Electron/Node idle or active resource use is demonstrably excessive;
- Electron distribution size is operationally problematic;
- Node lifecycle/control code becomes a meaningful maintenance burden;
- shared Rust integration with Goose would remove substantial duplication;
- browser-host crashes or process ownership remain difficult to make deterministic in JavaScript;
- a Rust/Chromium hosting option becomes mature enough to preserve current automation semantics;
- Tauri/WRY gains capabilities that materially improve the WebView automation/ownership trade-off;
- supported-platform priorities change enough that OS WebViews become preferable.

Technical interest alone is not a trigger.

---

## 15. Current recommendation

1. **Finish Electron first.** It currently best matches the required controlled-Chromium/CDP architecture and lets this fork reuse substantial upstream reliability work.
2. **Measure it.** Establish actual resource and reliability baselines.
3. **Prefer a Rust control-plane experiment before a browser-engine rewrite.** The most promising first future architecture is likely Rust supervision/control with Electron retained as a deliberately narrow Chromium appliance.
4. **Evaluate Tauri, do not assume it.** Tauri offers real footprint and Rust-integration benefits, but its OS-WebView model may be a worse fit for exact Chromium/CDP automation, especially on macOS.
5. **Only replace Electron if the replacement wins the same browser/session reliability qualification suite and delivers a measurable system-level benefit.**

The long-term optimization target should therefore be phrased as **“Rust/browser-host optimization”**, not **“Tauri migration.”**

---

## References / facts to re-check when this proposal is reopened

These links reflect the architecture as of 2026-08-11 and must be re-checked before implementation because Goose, Electron and Tauri evolve quickly.

- Goose repository / Rust implementation statement: https://github.com/aaif-goose/goose
- Electron `WebContentsView`: https://www.electronjs.org/docs/latest/api/web-contents-view
- Electron `webContents` / DevTools target identity: https://www.electronjs.org/docs/latest/api/web-contents/
- Electron web-embed guidance: https://www.electronjs.org/docs/latest/tutorial/web-embeds
- Tauri architecture / Rust + OS WebView: https://v2.tauri.app/concept/architecture/
- Tauri process model / current platform WebViews: https://v2.tauri.app/concept/process-model/
- Tauri WebView API / data directory and data-store differences: https://v2.tauri.app/reference/javascript/api/namespacewebview/
- Tauri overview / application-size rationale: https://v2.tauri.app/start/
