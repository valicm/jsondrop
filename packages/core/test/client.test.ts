import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  bearer,
  clientCredentials,
  isJsonApiError,
  JsonApiClient,
  JsonApiError,
  type Resource,
  type ResourceBase,
  type ToOne,
} from '../src/index.js';
import { json, mockFetch } from './mock-fetch.js';

interface TestArticle extends ResourceBase<'node--test_article'> {
  title: string;
  uid: ToOne<ResourceBase<'user--user'> & { name: string }>;
}

declare module '../src/index.js' {
  interface ResourceTypes {
    'node--test_article': TestArticle;
  }
}

const article = { type: 'node--test_article', id: 'a1', attributes: { title: 'Hello' } };

function client(fetch: typeof globalThis.fetch, options: Partial<ConstructorParameters<typeof JsonApiClient>[0]> = {}) {
  return new JsonApiClient({ baseUrl: 'https://example.com/', fetch, ...options });
}

describe('JsonApiClient', () => {
  it('fetches a typed resource from the default path', async () => {
    const { fetch, calls } = mockFetch(json({ data: article }));
    const result = await client(fetch).getResource('node--test_article', 'a1', { query: { include: ['uid'] } });

    expectTypeOf(result).toEqualTypeOf<TestArticle>();
    expect(result.title).toBe('Hello');
    expect(calls[0]!.url).toBe('https://example.com/jsonapi/node/test_article/a1?include=uid');
    expect(calls[0]!.headers.get('Accept')).toBe('application/vnd.api+json');
    expect(calls[0]!.headers.has('Content-Type')).toBe(false);
  });

  it('types unregistered resources as Resource', async () => {
    const { fetch } = mockFetch(json({ data: [] }));
    const result = await client(fetch).getCollection('custom--thing');
    expectTypeOf(result).toEqualTypeOf<Resource[]>();
  });

  it('uses configured resource paths, language prefix and API prefix', async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    const api = client(fetch, { apiPrefix: '/api', locale: 'de', defaultLocale: 'en', resourcePaths: { 'commerce_product--default': '/products' } });
    await api.getCollection('commerce_product--default');
    await api.getCollection('user--user', { locale: 'en' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/de/api/products',
      'https://example.com/api/user/user',
    ]);
  });

  it('resolves paths: map, then resolvers (child before parent), then default', async () => {
    const { fetch } = mockFetch(json({ data: null }));
    const base = client(fetch, {
      resourcePaths: { 'a--x': '/mapped' },
      resolveResourcePath: (type) => (type.startsWith('b--') ? '/parent' : undefined),
    });
    const child = base.extend({ resolveResourcePath: (type) => (type === 'b--y' ? '/child' : undefined) });
    expect(['a--x', 'b--x', 'b--y', 'c--z'].map((type) => child.resourcePath(type))).toEqual(['/mapped', '/parent', '/child', '/c/z']);
  });

  it('discovers resource paths from the entry point', async () => {
    // Shaped like a JSON:API Extras site's index (FOREO's, abridged).
    const { fetch, calls } = mockFetch(json({
      data: [],
      links: {
        self: { href: 'https://example.com/jsonapi' },
        products: { href: 'https://example.com/jsonapi/products' },
        'menu_links--main': { href: 'http://internal/jsonapi/menus/main' },
        'node--support': { href: 'https://example.com/jsonapi/node/support' },
      },
    }));
    const base = client(fetch, { resourcePaths: { products: '/catalog' } });
    expect(await base.discoverResourcePaths()).toEqual({ products: '/products', 'menu_links--main': '/menus/main', 'node--support': '/node/support' });
    expect(calls[0]!.url).toBe('https://example.com/jsonapi');

    const discovered = await base.withDiscoveredPaths();
    expect(discovered.resourcePath('menu_links--main')).toBe('/menus/main');
    // Configured paths win over discovered ones.
    expect(discovered.resourcePath('products')).toBe('/catalog');
  });

  it('sends headers in order: client, auth, request', async () => {
    const { fetch, calls } = mockFetch(json({ data: null }));
    const api = client(fetch, {
      headers: async () => ({ 'X-Market': 'HR', 'X-Over': 'client' }),
      auth: bearer(() => 'tok'),
    });
    await api.get('/x', { headers: { 'X-Over': 'request' } });
    const headers = calls[0]!.headers;
    expect(headers.get('X-Market')).toBe('HR');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('X-Over')).toBe('request');
  });

  it('skips auth when asked', async () => {
    const { fetch, calls } = mockFetch(json({ data: null }));
    await client(fetch, { auth: bearer('tok') }).get('/x', { auth: false });
    expect(calls[0]!.headers.has('Authorization')).toBe(false);
  });

  it('passes fetch options through', async () => {
    const { fetch, calls } = mockFetch(json({ data: null }));
    await client(fetch, { fetchOptions: { cache: 'no-store' } }).get('/x', { fetchOptions: { next: { tags: ['node:1'] } } });
    expect(calls[0]!.init).toMatchObject({ cache: 'no-store', next: { tags: ['node:1'] } });
  });

  it('creates, updates and deletes resources', async () => {
    const { fetch, calls } = mockFetch(json({ data: article }, 201), json({ data: article }), json(null, 204));
    const api = client(fetch);
    await api.createResource('node--test_article', { attributes: { title: 'Hello' }, relationships: { uid: { type: 'user--user', id: 'u1' } } });
    await api.updateResource('node--test_article', 'a1', { attributes: { title: 'Changed' } });
    await api.deleteResource('node--test_article', 'a1');

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST https://example.com/jsonapi/node/test_article',
      'PATCH https://example.com/jsonapi/node/test_article/a1',
      'DELETE https://example.com/jsonapi/node/test_article/a1',
    ]);
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/vnd.api+json');
    expect(calls[0]!.body).toEqual({
      data: { type: 'node--test_article', attributes: { title: 'Hello' }, relationships: { uid: { data: { type: 'user--user', id: 'u1' } } } },
    });
    expect(calls[1]!.body).toEqual({ data: { type: 'node--test_article', id: 'a1', attributes: { title: 'Changed' } } });
  });

  it('uploads a file as an octet stream', async () => {
    const { fetch, calls } = mockFetch(json({ data: { type: 'file--file', id: 'f1', attributes: { filename: 'a.jpg' } } }, 201));
    const file = await client(fetch).uploadFile('node--test_article', 'field_image', { data: new Uint8Array([1, 2]), filename: 'a "b".jpg' }, { entityId: 'a1' });
    expect(file.id).toBe('f1');
    expect(calls[0]!.url).toBe('https://example.com/jsonapi/node/test_article/a1/field_image');
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(calls[0]!.headers.get('Content-Disposition')).toBe('file; filename="a _b_.jpg"');
  });

  it('throws JsonApiError with Drupal\'s detail', async () => {
    const { fetch } = mockFetch(json({ errors: [{ status: '422', title: 'Unprocessable', detail: 'title: This value should not be null.' }] }, 422));
    const error = await client(fetch).post('/node/article', {}).catch((caught: unknown) => caught);
    expect(isJsonApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 422, message: 'title: This value should not be null.', method: 'POST' });
  });

  it('throws on a non-JSON response', async () => {
    const { fetch } = mockFetch(() => new Response('<html>Oops</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    await expect(client(fetch).get('/x')).rejects.toThrow(JsonApiError);
    const { fetch: okFetch } = mockFetch(() => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    await expect(client(okFetch).get('/x')).rejects.toThrow(/Expected a JSON:API document/);
  });

  it('reports every request', async () => {
    const onResponse = vi.fn();
    const { fetch } = mockFetch(json({ data: null }, 404));
    await client(fetch, { onResponse }).get('/x').catch(() => {});
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: 'https://example.com/jsonapi/x', status: 404 }));
  });

  it('pages through a collection on the site\'s own origin', async () => {
    const { fetch, calls } = mockFetch(
      json({ data: [article], links: { next: { href: 'http://internal:8080/jsonapi/node/test_article?page%5Boffset%5D=1&page%5Blimit%5D=1' } } }),
      json({ data: [{ ...article, id: 'a2' }], links: {} }),
    );
    const ids: string[] = [];
    for await (const item of client(fetch, { auth: bearer('tok') }).iterate('node--test_article', { query: { page: { limit: 1 } } })) {
      ids.push(item.id);
    }
    expect(ids).toEqual(['a1', 'a2']);
    expect(calls[1]!.url).toBe('https://example.com/jsonapi/node/test_article?page%5Boffset%5D=1&page%5Blimit%5D=1');
    expect(calls[1]!.headers.get('Authorization')).toBe('Bearer tok');
  });

  it('adds a query to an absolute URL', async () => {
    const { fetch, calls } = mockFetch(json({ data: null }));
    const api = client(fetch, { locale: 'de', defaultLocale: 'en' });
    await api.get(api.siteUrl('/router/translate-path'), { query: { params: { path: '/about' } } });
    await api.get('https://example.com/jsonapi/x?a=1', { query: { params: { b: '2' } } });
    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/de/router/translate-path?path=%2Fabout',
      'https://example.com/jsonapi/x?a=1&b=2',
    ]);
  });

  it('extends a client, combining headers', async () => {
    const { fetch, calls } = mockFetch(json({ data: null }));
    const base = client(fetch, { headers: { 'X-Market': 'HR' } });
    await base.extend({ headers: () => ({ 'Commerce-Cart-Token': 'cart' }) }).get('/carts');
    expect(calls[0]!.headers.get('X-Market')).toBe('HR');
    expect(calls[0]!.headers.get('Commerce-Cart-Token')).toBe('cart');
  });
});

describe('clientCredentials', () => {
  const token = (value: string, expiresIn = 300) => () => new Response(JSON.stringify({ access_token: value, expires_in: expiresIn }), { status: 200 });

  it('fetches one token for concurrent requests and caches it', async () => {
    const { fetch, calls } = mockFetch((call) => (call.url.endsWith('/oauth/token') ? token('t1')() : json({ data: null })(call)));
    const api = client(fetch, { auth: clientCredentials({ clientId: 'id', clientSecret: 'secret', scope: 'content:read' }) });
    await Promise.all([api.get('/a'), api.get('/b')]);
    await api.get('/c');

    const tokenCalls = calls.filter((call) => call.url.endsWith('/oauth/token'));
    expect(tokenCalls).toHaveLength(1);
    const form = new URLSearchParams(String(tokenCalls[0]!.init.body));
    expect(Object.fromEntries(form)).toEqual({ grant_type: 'client_credentials', client_id: 'id', client_secret: 'secret', scope: 'content:read' });
    expect(calls.filter((call) => call.url.includes('/jsonapi/')).every((call) => call.headers.get('Authorization') === 'Bearer t1')).toBe(true);
  });

  it('renews the token and retries once on 401', async () => {
    let issued = 0;
    const { fetch, calls } = mockFetch((call) => {
      if (call.url.endsWith('/oauth/token')) return token(`t${++issued}`)();
      return call.headers.get('Authorization') === 'Bearer t1' ? json({ errors: [] }, 401)(call) : json({ data: null })(call);
    });
    const response = await client(fetch, { auth: clientCredentials({ clientId: 'id', clientSecret: 'secret' }) }).get('/a');
    expect(response.status).toBe(200);
    expect(calls.map((call) => call.headers.get('Authorization') ?? 'token')).toEqual(['token', 'Bearer t1', 'token', 'Bearer t2']);
  });

  it('reports a failed token request', async () => {
    const { fetch } = mockFetch(() => new Response('{"error":"invalid_client"}', { status: 401 }));
    await expect(client(fetch, { auth: clientCredentials({ clientId: 'id', clientSecret: 'bad' }) }).get('/a')).rejects.toThrow(/invalid_client/);
  });
});
