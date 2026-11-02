import type { SchemaIssue } from './schema.js';
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

/**
 * A successful response whose `data` failed the request's `schema`: the site
 * and the schema disagree, which is not the same as the resource being
 * missing. Deliberately carries no response body, so it is safe to log; the
 * `onResponse` hook has already seen the body.
 */
export class JsonApiSchemaError extends Error {
  override readonly name = 'JsonApiSchemaError';

  constructor(
    readonly status: number,
    readonly issues: SchemaIssue[],
    readonly method: string,
    readonly url: string,
  ) {
    super(`Response from ${method} ${url} does not match its schema: ${describeIssues(issues)}`);
  }
}

export function isJsonApiSchemaError(error: unknown): error is JsonApiSchemaError {
  return error instanceof JsonApiSchemaError;
}

function describeIssues(issues: SchemaIssue[]): string {
  const [first] = issues;
  if (!first) return 'no details';
  const where = first.path.length > 0 ? `${first.path.map(String).join('.')}: ` : '';
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
  return `${where}${first.message}${more}`;
}
