import type { Document, ErrorObject } from './types.js';

/**
 * A non-2xx response, or a response that was not a JSON document.
 *
 * `errors` are the document's error objects, and `message` is the first
 * one's `detail`, which is where Drupal puts the readable explanation.
 */
export class JsonApiError extends Error {
  override readonly name = 'JsonApiError';

  constructor(
    readonly status: number,
    readonly errors: ErrorObject[],
    readonly document: Document | null,
    readonly method: string,
    readonly url: string,
  ) {
    super(errors[0]?.detail ?? errors[0]?.title ?? `HTTP ${status} from ${method} ${url}`);
  }
}

export function isJsonApiError(error: unknown): error is JsonApiError {
  return error instanceof JsonApiError;
}
