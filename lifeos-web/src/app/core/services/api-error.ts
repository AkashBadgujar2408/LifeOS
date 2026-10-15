import { HttpErrorResponse } from '@angular/common/http';

/** What to say when the API never answered. */
export const UNREACHABLE =
  "Can't reach the LifeOS server. Check that it's running, then try again.";

/**
 * The sentence to show the user for a failed API call. Every API error comes back in the ApiResponse envelope
 * (business failures, model validation, unexpected exceptions), so `message` is the reason when there is one;
 * otherwise the caller's fallback, made more specific when the server couldn't be reached at all or failed.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body: unknown = err.error;
  const isEnvelope = !!body && typeof body === 'object';

  // Nothing answered: no connection at all (0), or the dev proxy / a gateway saying the API is down (502-504). The
  // API's own 500s always carry the envelope, so a bare 5xx means the request never reached it either.
  if (
    err.status === 0 ||
    (err.status >= 500 && !isEnvelope) ||
    [502, 503, 504].includes(err.status)
  ) {
    return UNREACHABLE;
  }

  if (isEnvelope) {
    const { message, errors } = body as { message?: unknown; errors?: unknown };
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(errors) && typeof errors[0] === 'string') {
      return errors[0];
    }
  }

  return err.status >= 500 ? `${fallback} Something went wrong on the server.` : fallback;
}
