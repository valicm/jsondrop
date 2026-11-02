import type { AuthStrategy } from './auth.js';
import { deserialize } from './deserialize.js';
import { JsonApiError, JsonApiSchemaError } from './errors.js';
import { buildQueryString, type QueryInput } from './query.js';
import { runSchema, type InferSchemaOutput, type StandardSchemaV1 } from './schema.js';
import { serialize, type ResourceInput } from './serialize.js';
import type { Document, Links, Meta, Resource, ResourceOf, ResourceType } from './types.js';

export const JSON_API_MEDIA_TYPE = 'application/vnd.api+json';

/**
 * Extra `fetch` options: `cache`, `credentials`, and framework extensions
 * such as Next.js's `next: { revalidate, tags }`.
 */
export type FetchOptions = Omit<RequestInit, 'method' | 'headers' | 'body' | 'signal'> & Record<string, unknown>;

type HeadersSource = HeadersInit | (() => HeadersInit | undefined | Promise<HeadersInit | undefined>);

/** One finished request, for logging or a request inspector. */
export interface RequestRecord {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface JsonApiClientOptions {
  /** Site origin, e.g. `https://example.com`. A trailing slash is ignored. */
  baseUrl: string;
  /** Path prefix of the JSON:API. Default `/jsonapi`. */
  apiPrefix?: string;
  /** Language of requests; sent as a path prefix unless it is `defaultLocale`. */
  locale?: string;
  /** The site's default language, which has no path prefix. */
  defaultLocale?: string;
  auth?: AuthStrategy;
  /** Headers added to every request. */
  headers?: HeadersSource;
  /**
   * JSON:API path per resource type, relative to `apiPrefix`, for types
   * whose path is not the default `/{entity_type}/{bundle}` (renamed with
   * JSON:API Extras, or custom resources).
   */
  resourcePaths?: Record<string, string>;
  /**
   * Computes paths for whole families of types (commerce_api's renamed
   * Commerce types); `undefined` falls through to the default. Consulted
   * after `resourcePaths`.
   */
  resolveResourcePath?: (type: string) => string | undefined;
  /** Default `fetch` options for every request. */
  fetchOptions?: FetchOptions;
  fetch?: typeof fetch;
  /** Called after every request, failed ones included. */
  onResponse?: (record: RequestRecord) => void;
}

export interface RequestOptions {
  query?: QueryInput;
  /** A JSON:API document, sent as JSON. */
  body?: unknown;
  /** A raw body (file uploads); the caller sets its Content-Type. */
  rawBody?: BodyInit;
  headers?: HeadersInit;
  /** Language of this request, overriding the client's. */
  locale?: string;
  /** `false` sends this request anonymously. */
  auth?: AuthStrategy | false;
  fetchOptions?: FetchOptions;
  signal?: AbortSignal;
  /**
   * How to read the response. `jsonapi` (default) deserializes a JSON:API
   * document into `data`. `json` puts plain JSON in `data` as is, for
   * Drupal's other endpoints (REST resources, user login). `text` puts the
   * body text in `data` (`/session/token`).
   */
  parse?: 'jsonapi' | 'json' | 'text';
}

/** Options for the resource-level methods. */
export type ResourceRequestOptions = Omit<RequestOptions, 'body' | 'rawBody'>;

/**
 * Validates a response on the request methods (`get`, `post`, `patch`,
 * `delete`, `request`). Takes any Standard Schema (Zod, Valibot, ArkType, …)
 * and runs on `data` after deserialization, so it describes the resource and
 * not the JSON:API document. `data` becomes the schema's output, typed from
 * it; a mismatch throws {@link JsonApiSchemaError}.
 */
export interface SchemaOption<S extends StandardSchemaV1 = StandardSchemaV1> {
  schema: S;
}

/** A response: the raw document plus its deserialized primary data. */
export interface JsonApiResponse<T> {
  status: number;
  headers: Headers;
  document: Document;
  data: T;
  meta: Meta;
  links: Links;
}

/** One page of a collection. */
export interface Page<T> {
  data: T[];
  meta: Meta;
  links: Links;
  document: Document;
  hasNext: boolean;
  /** The following page, or NULL on the last one. */
  next(): Promise<Page<T> | null>;
}

export interface FileInput {
  data: Blob | ArrayBuffer | Uint8Array;
  filename: string;
}

/**
 * A client for Drupal's JSON:API.
 *
 * Two levels:
 * - resource methods (`getResource`, `getCollection`, `createResource`, …)
 *   take a resource type name and return deserialized resources, typed by
 *   the {@link ResourceTypes} registry;
 * - request methods (`get`, `post`, `request`, …) take a path relative to
 *   the API prefix, for custom resources such as commerce_api's cart.
 *
 * Non-2xx responses throw {@link JsonApiError}.
 */
export class JsonApiClient {
  readonly baseUrl: string;
  readonly apiPrefix: string;
  private readonly fetchImpl: typeof fetch;

  constructor(readonly options: JsonApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiPrefix = options.apiPrefix ?? '/jsonapi';
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /**
   * A client with some options replaced. Headers are combined: the new
   * ones are added after (and win over) this client's. The auth strategy is
   * shared unless replaced, so a cached token is reused.
   */
  extend(options: Partial<JsonApiClientOptions>): JsonApiClient {
    const parent = this.options.headers;
    const child = options.headers;
    const headers: HeadersSource | undefined = parent && child
      ? async () => merge(await resolveHeaders(parent), await resolveHeaders(child))
      : child ?? parent;
    const parentResolver = this.options.resolveResourcePath;
    const childResolver = options.resolveResourcePath;
    return new JsonApiClient({
      ...this.options,
      ...options,
      headers,
      resolveResourcePath: parentResolver && childResolver
        ? (type) => childResolver(type) ?? parentResolver(type)
        : childResolver ?? parentResolver,
      resourcePaths: { ...this.options.resourcePaths, ...options.resourcePaths },
      fetchOptions: { ...this.options.fetchOptions, ...options.fetchOptions },
    });
  }

  /**
   * Reads every resource type's path from the API's entry point (`GET
   * /jsonapi`), which lists them as links keyed by type name. Covers types
   * renamed or moved with JSON:API Extras without mapping them by hand.
   *
   * ```ts
   * const drupal = await new JsonApiClient({ baseUrl }).withDiscoveredPaths();
   * ```
   */
  async discoverResourcePaths(options?: Pick<RequestOptions, 'auth' | 'headers' | 'fetchOptions' | 'signal'>): Promise<Record<string, string>> {
    const response = await this.request('GET', '', options);
    const paths: Record<string, string> = {};
    for (const [type, link] of Object.entries(response.links)) {
      if (type === 'self' || !link?.href) continue;
      const pathname = new URL(link.href, this.baseUrl).pathname;
      const at = pathname.indexOf(`${this.apiPrefix}/`);
      if (at !== -1) paths[type] = pathname.slice(at + this.apiPrefix.length);
    }
    return paths;
  }

  /**
   * A client with the paths from {@link discoverResourcePaths}. Paths
   * configured in `resourcePaths` keep precedence. Discover once at
   * startup and reuse the client: it is one request.
   */
  async withDiscoveredPaths(options?: Parameters<JsonApiClient['discoverResourcePaths']>[0]): Promise<JsonApiClient> {
    const discovered = await this.discoverResourcePaths(options);
    return this.extend({ resourcePaths: { ...discovered, ...this.options.resourcePaths } });
  }

  /** JSON:API path of a resource type, relative to the API prefix. */
  resourcePath(type: string): string {
    const configured = this.options.resourcePaths?.[type] ?? this.options.resolveResourcePath?.(type);
    if (configured) return configured;
    const [entityType, bundle = entityType] = type.split('--');
    return `/${entityType}/${bundle}`;
  }

  /** Absolute URL of an API path. */
  url(path: string, query?: QueryInput, locale?: string): string {
    return this.siteUrl(`${this.apiPrefix}${path}`, query, locale);
  }

  /**
   * Absolute URL of a site path outside the API (`/router/translate-path`),
   * with the language prefix.
   */
  siteUrl(path: string, query?: QueryInput, locale?: string): string {
    const language = locale ?? this.options.locale;
    const prefix = language && language !== this.options.defaultLocale ? `/${language}` : '';
    return `${this.baseUrl}${prefix}${path}${buildQueryString(query)}`;
  }

  // Resource methods.

  async getResource<T extends ResourceType>(type: T, id: string, options?: ResourceRequestOptions): Promise<ResourceOf<T>> {
    const response = await this.get<ResourceOf<T>>(`${this.resourcePath(type)}/${id}`, options);
    return response.data;
  }

  /** One page of a collection (Drupal's default page size is 50). */
  async getCollection<T extends ResourceType>(type: T, options?: ResourceRequestOptions): Promise<ResourceOf<T>[]> {
    const response = await this.get<ResourceOf<T>[]>(this.resourcePath(type), options);
    return response.data;
  }

  /** A page of a collection, with its meta and a way to the next page. */
  async getPage<T extends ResourceType>(type: T, options?: ResourceRequestOptions): Promise<Page<ResourceOf<T>>> {
    const response = await this.get<ResourceOf<T>[]>(this.resourcePath(type), options);
    return this.page(response, options);
  }

  /** Every resource of a collection, following `next` links page by page. */
  async *iterate<T extends ResourceType>(type: T, options?: ResourceRequestOptions): AsyncGenerator<ResourceOf<T>, void, undefined> {
    let page: Page<ResourceOf<T>> | null = await this.getPage(type, options);
    while (page) {
      yield* page.data;
      page = await page.next();
    }
  }

  async createResource<T extends ResourceType>(type: T, input: ResourceInput, options?: ResourceRequestOptions): Promise<ResourceOf<T>> {
    const response = await this.request<ResourceOf<T>>('POST', this.resourcePath(type), { ...options, body: serialize(type, input) });
    return response.data;
  }

  async updateResource<T extends ResourceType>(type: T, id: string, input: Omit<ResourceInput, 'id'>, options?: ResourceRequestOptions): Promise<ResourceOf<T>> {
    const response = await this.request<ResourceOf<T>>('PATCH', `${this.resourcePath(type)}/${id}`, {
      ...options,
      body: serialize(type, { ...input, id }),
    });
    return response.data;
  }

  async deleteResource(type: ResourceType, id: string, options?: ResourceRequestOptions): Promise<void> {
    await this.request('DELETE', `${this.resourcePath(type)}/${id}`, options);
  }

  /**
   * Uploads a file into a file field (core's JSON:API file upload). With
   * `entityId`, the file is attached to that entity's field; without, a
   * temporary file is created to reference in a later create or update.
   */
  async uploadFile(type: ResourceType, field: string, file: FileInput, options: ResourceRequestOptions & { entityId?: string } = {}): Promise<ResourceOf<'file--file'>> {
    const { entityId, ...rest } = options;
    const path = `${this.resourcePath(type)}${entityId ? `/${entityId}` : ''}/${field}`;
    const headers = new Headers(rest.headers);
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `file; filename="${file.filename.replace(/["\\\r\n]/g, '_')}"`);
    const response = await this.request<ResourceOf<'file--file'>>('POST', path, {
      ...rest,
      headers,
      rawBody: file.data as BodyInit,
    });
    return response.data;
  }

  // Request methods: paths relative to the API prefix.

  get<S extends StandardSchemaV1>(path: string, options: Omit<RequestOptions, 'body' | 'rawBody'> & SchemaOption<S>): Promise<JsonApiResponse<InferSchemaOutput<S>>>;
  get<T = Resource | Resource[] | null>(path: string, options?: Omit<RequestOptions, 'body' | 'rawBody'>): Promise<JsonApiResponse<T>>;
  get(path: string, options?: Omit<RequestOptions, 'body' | 'rawBody'> & Partial<SchemaOption>): Promise<JsonApiResponse<unknown>> {
    return this.execute('GET', path, options);
  }

  post<S extends StandardSchemaV1>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> & SchemaOption<S>): Promise<JsonApiResponse<InferSchemaOutput<S>>>;
  post<T = Resource | Resource[] | null>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<JsonApiResponse<T>>;
  post(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'> & Partial<SchemaOption>): Promise<JsonApiResponse<unknown>> {
    return this.execute('POST', path, { ...options, body });
  }

  patch<S extends StandardSchemaV1>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> & SchemaOption<S>): Promise<JsonApiResponse<InferSchemaOutput<S>>>;
  patch<T = Resource | Resource[] | null>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<JsonApiResponse<T>>;
  patch(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'> & Partial<SchemaOption>): Promise<JsonApiResponse<unknown>> {
    return this.execute('PATCH', path, { ...options, body });
  }

  delete<S extends StandardSchemaV1>(path: string, body: unknown, options: Omit<RequestOptions, 'body'> & SchemaOption<S>): Promise<JsonApiResponse<InferSchemaOutput<S>>>;
  delete<T = Resource | Resource[] | null>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<JsonApiResponse<T>>;
  delete(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'> & Partial<SchemaOption>): Promise<JsonApiResponse<unknown>> {
    return this.execute('DELETE', path, { ...options, body });
  }

  /**
   * Sends a request. `path` is relative to the API prefix, or an absolute
   * URL (from a document's links, or {@link siteUrl}); an absolute URL keeps
   * only its path and query, plus `query` if given, and is sent to
   * `baseUrl`, so links Drupal builds with an internal host (behind a
   * proxy) still work and credentials never leave the site.
   */
  request<S extends StandardSchemaV1>(method: string, path: string, options: RequestOptions & SchemaOption<S>): Promise<JsonApiResponse<InferSchemaOutput<S>>>;
  request<T>(method: string, path: string, options?: RequestOptions): Promise<JsonApiResponse<T>>;
  request(method: string, path: string, options?: RequestOptions & Partial<SchemaOption>): Promise<JsonApiResponse<unknown>> {
    return this.execute(method, path, options);
  }

  private async execute(method: string, path: string, options: RequestOptions & Partial<SchemaOption> = {}): Promise<JsonApiResponse<unknown>> {
    const url = /^https?:\/\//.test(path) ? this.sameOrigin(path, options.query) : this.url(path, options.query, options.locale);
    const auth = options.auth === false ? undefined : options.auth ?? this.options.auth;

    let sent = await this.send(method, url, options, auth);
    if (sent.response.status === 401 && auth?.invalidate && auth.invalidate() !== false) {
      sent = await this.send(method, url, options, auth);
    }
    const response = this.parse<unknown>(method, url, options, sent);
    if (!options.schema) {
      return response;
    }
    const result = await runSchema(options.schema, response.data);
    if ('issues' in result) {
      throw new JsonApiSchemaError(response.status, result.issues, method, url);
    }
    return { ...response, data: result.value };
  }

  private async send(method: string, url: string, options: RequestOptions, auth: AuthStrategy | undefined): Promise<Sent> {
    const headers = new Headers(await resolveHeaders(this.options.headers));
    headers.set('Accept', JSON_API_MEDIA_TYPE);
    if (options.body !== undefined) {
      headers.set('Content-Type', JSON_API_MEDIA_TYPE);
    }
    if (auth) {
      new Headers(await auth.headers({ baseUrl: this.baseUrl, fetch: this.fetchImpl })).forEach((value, name) => headers.set(name, value));
    }
    new Headers(options.headers).forEach((value, name) => headers.set(name, value));

    const started = Date.now();
    const response = await this.fetchImpl(url, {
      ...this.options.fetchOptions,
      ...options.fetchOptions,
      method,
      headers,
      body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: options.signal,
    } as RequestInit);
    const text = await response.text();
    return { response, text, durationMs: Date.now() - started };
  }

  private parse<T>(method: string, url: string, options: RequestOptions, sent: Sent): JsonApiResponse<T> {
    const { response, text } = sent;
    let document: Document | null = null;
    if (text) {
      try {
        document = JSON.parse(text) as Document;
      }
      catch {
        document = null;
      }
    }

    this.options.onResponse?.({
      method,
      url,
      status: response.status,
      durationMs: sent.durationMs,
      requestBody: options.body,
      responseBody: document ?? text,
    });

    if (!response.ok) {
      // Drupal's plain JSON endpoints (user login, decoupled_router) answer
      // `{"message": "…"}` instead of JSON:API error objects.
      const message = (document as { message?: unknown } | null)?.message;
      const errors = document?.errors ?? (typeof message === 'string' ? [{ status: String(response.status), detail: message }] : []);
      throw new JsonApiError(response.status, errors, document, method, url);
    }
    const mode = options.parse ?? 'jsonapi';
    if (mode === 'text') {
      return { status: response.status, headers: response.headers, document: {}, data: text as T, meta: {}, links: {} };
    }
    if (text && document === null) {
      throw new JsonApiError(response.status, [{ detail: `Expected ${mode === 'json' ? 'JSON' : 'a JSON:API document'} from ${method} ${url}, got ${response.headers.get('Content-Type') ?? 'no content type'}` }], null, method, url);
    }
    if (mode === 'json') {
      return { status: response.status, headers: response.headers, document: {}, data: (document ?? null) as T, meta: {}, links: {} };
    }
    const body = document ?? {};
    return {
      status: response.status,
      headers: response.headers,
      document: body,
      data: deserialize(body) as T,
      meta: body.meta ?? {},
      links: body.links ?? {},
    };
  }

  private page<T>(response: JsonApiResponse<T[]>, options: ResourceRequestOptions | undefined): Page<T> {
    const next = response.links.next?.href;
    // The next link carries the whole query; only the other options apply.
    const { query: _query, ...rest } = options ?? {};
    return {
      data: response.data ?? [],
      meta: response.meta,
      links: response.links,
      document: response.document,
      hasNext: next !== undefined,
      next: async () => (next ? this.page(await this.get<T[]>(next, rest), options) : null),
    };
  }

  private sameOrigin(href: string, query?: QueryInput): string {
    const link = new URL(href);
    const extra = buildQueryString(query).slice(1);
    const search = link.search && extra ? `${link.search}&${extra}` : link.search || (extra ? `?${extra}` : '');
    return `${new URL(this.baseUrl).origin}${link.pathname}${search}`;
  }
}

interface Sent {
  response: Response;
  text: string;
  durationMs: number;
}

async function resolveHeaders(source: HeadersSource | undefined): Promise<HeadersInit | undefined> {
  return typeof source === 'function' ? source() : source;
}

function merge(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) {
    new Headers(source).forEach((value, name) => headers.set(name, value));
  }
  return headers;
}
