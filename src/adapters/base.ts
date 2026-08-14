import type { AdapterEvent, CodexParsedRequest } from "../types";

/** Metadata about the caller's incoming request, for auth-forwarding adapters. */
export interface IncomingMeta {
  headers: Headers;
  abortSignal?: AbortSignal;
  /** Correlates this adapter round with passive Responses transport telemetry. */
  flightRequestId?: string;
}

export interface ProviderAdapter {
  name: string;
  runTurn(
    parsed: CodexParsedRequest,
    incoming: IncomingMeta,
    emit: (event: AdapterEvent) => void,
  ): Promise<void>;
}
