import { isJsonApiError, type AuthStrategy, type FetchOptions, type JsonApiClient } from '@jsondrop/core';
import { normalizeElements, type WebformElements, type WebformField } from './elements.js';

/**
 * Webform through the webform_rest module (4.x): the element tree, submit,
 * and reading or updating a submission. Enable its REST resources and
 * grant the matching permissions ("restful get webform_rest_elements",
 * "restful post webform_rest_submit", …) in Drupal.
 *
 * Submitting runs Webform's own submission form logic: the same
 * validation, handlers (emails, remote posts) and confirmation settings as
 * a submit on the Drupal site.
 */

export interface WebformRequestOptions {
  /** Auth for this request; the client's own by default. */
  auth?: AuthStrategy | false;
  headers?: HeadersInit;
  /**
   * Required for writes authenticated by a Drupal session cookie (from
   * `login()`'s `csrfToken`, or `getCsrfToken()` in `@jsondrop/drupal`).
   * Anonymous and bearer-token requests do not need it.
   */
  csrfToken?: string;
  fetchOptions?: FetchOptions;
  signal?: AbortSignal;
}

/** A webform ready to render. */
export interface Webform {
  id: string;
  fields: WebformField[];
  /** The raw element tree, for anything the normalized fields leave out. */
  elements: WebformElements;
}

export interface SubmitResult {
  /** The submission's UUID (webform_rest calls it `sid`). */
  sid: string;
  /** With webform_rest's "Include confirmation settings" enabled. */
  confirmation?: {
    type?: string;
    url?: string;
    message?: string;
    title?: string;
    [key: string]: unknown;
  };
}

export interface Submission {
  /** The submission entity's fields (`sid`, `uuid`, `serial`, `completed`, `in_draft`, …). */
  entity: Record<string, unknown>;
  /** The submitted values, keyed by element. */
  data: Record<string, unknown>;
}

/** The submission did not pass Webform's validation. */
export class WebformValidationError extends Error {
  override readonly name = 'WebformValidationError';

  constructor(
    message: string,
    /** Messages keyed by element (`email`; `address][city` for composite parts). May contain HTML. */
    readonly errors: Record<string, string>,
  ) {
    super(message);
  }

  /** The message for a field (or any of its parts), or NULL. */
  errorFor(key: string): string | null {
    const match = Object.entries(this.errors).find(([name]) => name === key || name.startsWith(`${key}][`));
    return match ? match[1] : null;
  }
}

/** webform_rest refused the request: closed form, no access, drafts not allowed, unknown webform. */
export class WebformError extends Error {
  override readonly name = 'WebformError';

  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The element tree (`/webform_rest/{id}/elements`), with options expanded. */
export async function getWebformElements(client: JsonApiClient, webformId: string, options: WebformRequestOptions = {}): Promise<WebformElements> {
  return request<WebformElements>(client, 'GET', `/webform_rest/${encodeURIComponent(webformId)}/elements`, undefined, options);
}

/** A webform's fields, normalized for rendering. */
export async function getWebform(client: JsonApiClient, webformId: string, options: WebformRequestOptions = {}): Promise<Webform> {
  const elements = await getWebformElements(client, webformId, options);
  return { id: webformId, fields: normalizeElements(elements), elements };
}

/**
 * The initialized elements (`/webform_rest/{id}/fields`): the webform's
 * own definitions with tokens replaced, without the form's processing (an
 * options set stays an ID). Prefer {@link getWebformElements} to render.
 */
export async function getWebformFields(client: JsonApiClient, webformId: string, options: WebformRequestOptions = {}): Promise<WebformElements> {
  return request<WebformElements>(client, 'GET', `/webform_rest/${encodeURIComponent(webformId)}/fields`, undefined, options);
}

/**
 * Submits values, keyed by element (checkboxes as lists, composites as
 * objects). Throws {@link WebformValidationError} with messages per field
 * when Webform rejects them, {@link WebformError} when the form is closed
 * or the user may not submit it.
 */
export async function submitWebform(
  client: JsonApiClient,
  webformId: string,
  values: Record<string, unknown>,
  options: WebformRequestOptions & { draft?: boolean } = {},
): Promise<SubmitResult> {
  const { draft, ...rest } = options;
  const body = { ...values, webform_id: webformId, ...(draft ? { draft: true } : {}) };
  const response = await request<Record<string, unknown>>(client, 'POST', '/webform_rest/submit', body, rest);
  const { sid, ...others } = response;
  const confirmation: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(others)) {
    if (name.startsWith('confirmation_')) confirmation[name.slice('confirmation_'.length)] = value;
  }
  return { sid: String(sid), ...(Object.keys(confirmation).length ? { confirmation: confirmation as SubmitResult['confirmation'] } : {}) };
}

/** A submission by UUID; the user needs view access to it. */
export async function getSubmission(client: JsonApiClient, webformId: string, uuid: string, options: WebformRequestOptions = {}): Promise<Submission> {
  const response = await request<{ entity?: Record<string, unknown>; data?: Record<string, unknown> }>(client, 'GET', submissionPath(webformId, uuid), undefined, options);
  return { entity: flattenEntity(response.entity ?? {}), data: response.data ?? {} };
}

/** Changes a submission's values (validated like a submit); the user needs update access. */
export async function updateSubmission(client: JsonApiClient, webformId: string, uuid: string, values: Record<string, unknown>, options: WebformRequestOptions = {}): Promise<{ sid: string }> {
  const response = await request<{ sid: string }>(client, 'PATCH', submissionPath(webformId, uuid), values, options);
  return { sid: String(response.sid) };
}

function submissionPath(webformId: string, uuid: string): string {
  return `/webform_rest/${encodeURIComponent(webformId)}/submission/${encodeURIComponent(uuid)}`;
}

async function request<T>(client: JsonApiClient, method: string, path: string, body: unknown, options: WebformRequestOptions): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);
  try {
    const response = await client.request<T>(method, client.siteUrl(path), {
      query: { params: { _format: 'json' } },
      body,
      headers,
      parse: 'json',
      ...(options.auth !== undefined ? { auth: options.auth } : {}),
      ...(options.fetchOptions ? { fetchOptions: options.fetchOptions } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return response.data;
  }
  catch (error) {
    throw toWebformError(error);
  }
}

/** webform_rest's 400 bodies: `{message, error: {element: message}}` or `{error: {message}}`. */
function toWebformError(error: unknown): unknown {
  if (!isJsonApiError(error) || !error.document) return error;
  const body = error.document as unknown as { message?: unknown; error?: unknown };
  const detail = body.error;
  if (typeof detail === 'object' && detail !== null && !Array.isArray(detail)) {
    const entries = Object.entries(detail as Record<string, unknown>);
    if (entries.length === 1 && entries[0]![0] === 'message' && typeof body.message !== 'string') {
      return new WebformError(String(entries[0]![1]), error.status);
    }
    const errors = Object.fromEntries(entries.map(([key, value]) => [key, Array.isArray(value) ? value.map(String).join(' ') : String(value)]));
    return new WebformValidationError(typeof body.message === 'string' ? body.message : 'The submission has errors.', errors);
  }
  if (typeof body.message === 'string') return new WebformError(body.message, error.status);
  return error;
}

/** Drupal's serializer gives each entity field as `[{value: …}]`; unwrap single values. */
function flattenEntity(entity: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entity).map(([key, value]) => {
    if (Array.isArray(value) && value.length <= 1) {
      const item = value[0] as Record<string, unknown> | undefined;
      if (item === undefined) return [key, null];
      const keys = Object.keys(item);
      return [key, keys.length === 1 && keys[0] === 'value' ? item.value : keys.length === 1 && keys[0] === 'target_id' ? item.target_id : item];
    }
    return [key, value];
  }));
}
