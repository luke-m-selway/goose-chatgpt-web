export interface ChatGptWebAdapterErrorOptions {
  status: number;
  errorType: string;
  code: string;
  retryable: boolean;
  cause?: unknown;
}

export class ChatGptWebAdapterError extends Error {
  readonly status: number;
  readonly errorType: string;
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options: ChatGptWebAdapterErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ChatGptWebAdapterError";
    this.status = options.status;
    this.errorType = options.errorType;
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

/**
 * Convert only an authoritatively pre-lease BrowserHost admission failure into the existing
 * retryable adapter contract. The caller is responsible for proving that no launcher turn-start
 * request capable of leasing a surface has been issued yet.
 */
export function chatGptBrowserHostUnavailableError(error: unknown): ChatGptWebAdapterError {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new ChatGptWebAdapterError(cause.message, {
    status: 503,
    errorType: "server_error",
    code: "chatgpt_browser_host_unavailable",
    retryable: true,
    cause,
  });
}
