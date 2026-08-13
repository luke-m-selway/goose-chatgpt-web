import { ChatGptWebAdapterError } from "./adapter-error";

export const CHATGPT_POST_SEND_CONTROL_PROBE_INTERVAL_MS = 5_000;
export const CHATGPT_POST_SEND_CONTROL_PROBE_TIMEOUT_MS = 3_000;
export const CHATGPT_POST_SEND_CONTROL_MAX_CONSECUTIVE_FAILURES = 2;
// Once ordinary CDP-health evidence has gone stale, an Electron-owned turn gets a distinct final
// window in which native lifecycle can report recovery or deterministic death. This is not a
// generation deadline: any completed control round trip, DOM progress, or Electron `responsive`
// transition clears it.
export const CHATGPT_POST_SEND_CONTROL_INDETERMINATE_TIMEOUT_MS = 60_000;
export const CHATGPT_BROWSER_CONTROL_CLEANUP_TIMEOUT_MS = 3_000;
export const CHATGPT_BROWSER_DIAGNOSTIC_TIMEOUT_MS = 6_000;

export async function withBrowserControlTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface PostSendBrowserControlLivenessEvent {
  /**
   * `slow`: the outstanding probe passed the probe timeout. `recovered`: it completed anyway.
   * `indeterminate`: recoverable grace-window entry. `indeterminate-terminal`: grace exhausted.
   */
  kind:
    | "slow"
    | "recovered"
    | "native-unresponsive"
    | "native-responsive"
    | "native-gone"
    | "native-destroyed"
    | "indeterminate"
    | "indeterminate-terminal";
  /** How long the probe this event describes has been (or was) outstanding. */
  outstandingMs: number;
  /** Time since the last probe that actually completed, i.e. the last proof of control health. */
  sinceHealthyMs: number;
  progressing: boolean;
}

export interface PostSendBrowserNativeLifecycle {
  traceId: string;
  surfaceId: string;
  rendererPid: number | null;
  status: "active" | "unresponsive" | "gone" | "destroyed";
  event: "created" | "responsive" | "unresponsive" | "render-process-gone" | "destroyed";
  revision: number;
  reason?: string;
}

export interface PostSendBrowserControlLivenessWatch {
  failure: Promise<never>;
  stop(): void;
}

/**
 * Watch only browser-control responsiveness after submission. This has no generation deadline: a
 * responsive browser may generate forever.
 *
 * A probe that takes longer than `probeTimeoutMs` proves only that the control path is slow, not
 * that it is dead — sibling turns on the same ChatGPT renderer routinely stall each other for
 * seconds while one of them boots its surface. So a slow probe is never scored as a failure and is
 * never abandoned: it stays outstanding, no replacement is issued behind it, and if it eventually
 * completes that is positive proof the control path still works. Only the sustained *absence* of a
 * completed control round trip makes the control state indeterminate. For an Electron-owned turn,
 * native `render-process-gone` or destroyed WebContents state is authoritative terminal evidence;
 * `unresponsive` is degraded state and a later `responsive` transition is positive recovery
 * evidence. If neither control/DOM progress nor decisive native lifecycle arrives, a separate
 * prolonged-indeterminate bound still terminates the turn. Renderer PID is deliberately ignored
 * by verdict logic: it is correlation evidence, not responsiveness evidence.
 */
export function startPostSendBrowserControlLiveness(
  probe: () => Promise<unknown>,
  options: {
    intervalMs?: number;
    probeTimeoutMs?: number;
    maxConsecutiveFailures?: number;
    indeterminateTimeoutMs?: number;
    isProgressing?: () => boolean;
    getNativeLifecycle?: () => PostSendBrowserNativeLifecycle | undefined;
    onEvent?: (event: PostSendBrowserControlLivenessEvent) => void;
  } = {},
): PostSendBrowserControlLivenessWatch {
  const intervalMs = options.intervalMs ?? CHATGPT_POST_SEND_CONTROL_PROBE_INTERVAL_MS;
  const probeTimeoutMs = options.probeTimeoutMs ?? CHATGPT_POST_SEND_CONTROL_PROBE_TIMEOUT_MS;
  const maxConsecutiveFailures = options.maxConsecutiveFailures ?? CHATGPT_POST_SEND_CONTROL_MAX_CONSECUTIVE_FAILURES;
  const indeterminateTimeoutMs = options.indeterminateTimeoutMs
    ?? CHATGPT_POST_SEND_CONTROL_INDETERMINATE_TIMEOUT_MS;
  const isProgressing = options.isProgressing ?? (() => false);
  const getNativeLifecycle = options.getNativeLifecycle;
  const onEvent = options.onEvent;
  if (intervalMs <= 0 || probeTimeoutMs <= 0 || maxConsecutiveFailures <= 0 || indeterminateTimeoutMs <= 0) {
    throw new Error("ChatGPT browser-control liveness bounds must be positive");
  }
  const unresponsiveAfterMs = maxConsecutiveFailures * (intervalMs + probeTimeoutMs);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastHealthyAt = Date.now();
  let indeterminateSince: number | undefined;
  let lastNativeRevision: string | undefined;
  let inFlight: { startedAt: number; slowReported: boolean } | undefined;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; });

  const emit = (kind: PostSendBrowserControlLivenessEvent["kind"], outstandingMs: number, progressing: boolean) => {
    if (!onEvent) return;
    try {
      onEvent({ kind, outstandingMs, sinceHealthyMs: Date.now() - lastHealthyAt, progressing });
    } catch { /* diagnostics must never affect the verdict */ }
  };

  const startProbe = () => {
    const attempt = { startedAt: Date.now(), slowReported: false };
    inFlight = attempt;
    const settle = (fulfilled: boolean) => {
      if (inFlight !== attempt) return;
      inFlight = undefined;
      // A rejected probe is an answer, not a round trip: Playwright rejects instantly once the
      // target is gone, so only fulfilment proves the control path is still carrying work.
      if (!fulfilled) return;
      const outstandingMs = Date.now() - attempt.startedAt;
      if (attempt.slowReported) emit("recovered", outstandingMs, false);
      lastHealthyAt = Date.now();
      indeterminateSince = undefined;
    };
    void Promise.resolve().then(probe).then(() => settle(true), () => settle(false));
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
  };

  function tick(): void {
    if (stopped) return;
    const now = Date.now();
    const nativeLifecycle = getNativeLifecycle?.();
    if (nativeLifecycle) {
      const nativeRevision = `${nativeLifecycle.traceId}:${nativeLifecycle.surfaceId}:${nativeLifecycle.revision}`;
      const nativeChanged = nativeRevision !== lastNativeRevision;
      if (nativeChanged) lastNativeRevision = nativeRevision;
      if (nativeLifecycle.status === "gone" || nativeLifecycle.status === "destroyed") {
        emit(nativeLifecycle.status === "gone" ? "native-gone" : "native-destroyed", 0, false);
        stopped = true;
        rejectFailure(new ChatGptWebAdapterError(
          nativeLifecycle.status === "gone"
            ? `ChatGPT Electron renderer exited after the message was sent${nativeLifecycle.reason ? ` (${nativeLifecycle.reason})` : ""}.`
            : "ChatGPT Electron WebContents was destroyed after the message was sent.",
          {
            status: 502,
            errorType: "server_error",
            code: nativeLifecycle.status === "gone"
              ? "chatgpt_browser_renderer_gone"
              : "chatgpt_browser_web_contents_destroyed",
            retryable: true,
          },
        ));
        return;
      }
      if (nativeChanged && nativeLifecycle.status === "unresponsive") {
        emit("native-unresponsive", 0, false);
      } else if (nativeChanged && nativeLifecycle.event === "responsive") {
        emit("native-responsive", 0, false);
        lastHealthyAt = now;
        indeterminateSince = undefined;
      }
    }
    if (!inFlight) startProbe();
    const outstanding = inFlight;
    const outstandingMs = outstanding ? now - outstanding.startedAt : 0;
    const progressing = isProgressing();
    if (outstanding && !outstanding.slowReported && outstandingMs >= probeTimeoutMs) {
      outstanding.slowReported = true;
      emit("slow", outstandingMs, progressing);
    }
    if (progressing) {
      lastHealthyAt = now;
      indeterminateSince = undefined;
    } else if (now - lastHealthyAt >= unresponsiveAfterMs) {
      if (getNativeLifecycle && nativeLifecycle) {
        if (indeterminateSince === undefined) {
          indeterminateSince = now;
          emit("indeterminate", outstandingMs, progressing);
          schedule();
          return;
        } else if (now - indeterminateSince < indeterminateTimeoutMs) {
          schedule();
          return;
        }
      }
      emit("indeterminate-terminal", outstandingMs, progressing);
      stopped = true;
      rejectFailure(new ChatGptWebAdapterError(
        "ChatGPT browser control remained in a prolonged indeterminate state after the message was sent;"
        + " no control round trip, DOM progress, Electron recovery, renderer exit, or WebContents destruction was observed.",
        {
          status: 502,
          errorType: "server_error",
          // Preserve the established retry classification while making the message and telemetry
          // explicit that this is not evidence that the renderer died.
          code: "chatgpt_browser_control_unresponsive",
          retryable: true,
        },
      ));
      return;
    }
    schedule();
  }

  schedule();
  return {
    failure,
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
