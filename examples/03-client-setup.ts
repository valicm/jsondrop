/**
 * Example 3: adapting the client to a site.
 *
 * Covers a custom auth strategy, site-specific headers, renamed resources
 * (JSON:API Extras), request logging, and one client per audience.
 */
import { bearer, JsonApiClient, type AuthStrategy, type RequestRecord } from '@jsondrop/core';

/**
 * A custom auth strategy: anything that returns headers. Implement
 * `invalidate()` and the client calls it on a 401 and retries once, which
 * suits cached tokens.
 */
export function apiKey(key: string): AuthStrategy {
  return { headers: () => ({ 'X-Api-Key': key }) };
}

/** A strategy around a token you refresh yourself (e.g. a customer's OAuth token). */
export function refreshingToken(load: () => Promise<{ token: string; refresh: () => Promise<string> }>): AuthStrategy {
  let current: string | null = null;
  return {
    async headers() {
      current ??= (await load()).token;
      return { Authorization: `Bearer ${current}` };
    },
    invalidate() {
      current = null;
    },
  };
}

/** Logs slow and failed requests. */
function log(record: RequestRecord) {
  if (record.status >= 400 || record.durationMs > 1000) {
    console.warn(`[drupal] ${record.method} ${record.url} → ${record.status} in ${record.durationMs}ms`);
  }
}

/**
 * The site's base client. JSON:API Extras moved the API to `/api` and
 * renamed two resources, and a custom module reads the visitor's region
 * from a header.
 */
export function createDrupal(region: () => string) {
  return new JsonApiClient({
    baseUrl: process.env.DRUPAL_URL ?? 'https://cms.example.com',
    apiPrefix: '/api',
    resourcePaths: {
      'node--article': '/articles',
      'node--event': '/events',
    },
    headers: () => ({ 'X-Region': region() }),
    onResponse: log,
    // Framework fetch options apply to every request, e.g. Next.js caching:
    fetchOptions: { next: { revalidate: 300 } },
  });
}

/**
 * One client per audience, derived with `extend()`. Derived clients add
 * headers to the parent's and share its auth strategy (and its token cache)
 * unless they replace it.
 */
export function audiences(base: JsonApiClient, customerToken: () => string | undefined) {
  return {
    /** Public, cacheable reads. */
    public: base,
    /** The signed-in customer's own data; never cached. */
    customer: base.extend({ auth: bearer(customerToken), fetchOptions: { cache: 'no-store', next: undefined } }),
    /** Editors previewing unpublished content. */
    preview: base.extend({ headers: { 'X-Preview': '1' }, fetchOptions: { cache: 'no-store' } }),
  };
}

/** Per request: language, cache tags, cancellation, anonymous. */
export async function perRequest(drupal: JsonApiClient, signal: AbortSignal) {
  return drupal.getCollection('node--event', {
    locale: 'de',
    signal,
    auth: false,
    fetchOptions: { next: { tags: ['events'] } },
  });
}
