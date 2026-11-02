import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as v from 'zod';
import {
  isJsonApiError,
  isJsonApiSchemaError,
  JsonApiClient,
  JsonApiError,
  JsonApiSchemaError,
  type StandardSchemaV1,
} from '../src/index.js';
import { json, mockFetch } from './mock-fetch.js';

const product = { type: 'products', id: 'p1', attributes: { title: 'FAQ 101', weight: 3 } };
const schema = v.object({ id: v.string(), title: v.string() });

function client(fetch: typeof globalThis.fetch, options: Partial<ConstructorParameters<typeof JsonApiClient>[0]> = {}) {
  return new JsonApiClient({ baseUrl: 'https://example.com', fetch, ...options });
}

/** Catches what `run` rejects with; fails if it resolves. */
async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  }
  catch (error) {
    return error;
  }
  throw new Error('Expected a rejection');
}

describe('schema option', () => {
  it('validates the deserialized resource and types data from a real Zod schema', async () => {
    const { fetch } = mockFetch(json({ data: product, meta: { count: 1 } }));
    const response = await client(fetch).get('/products/p1', { schema });

    expectTypeOf(response.data).toEqualTypeOf<{ id: string; title: string }>();
    expect(response.data).toEqual({ id: 'p1', title: 'FAQ 101' });
    expect(response.meta).toEqual({ count: 1 });
    expect(response.status).toBe(200);
  });

  it('returns the output of a schema that transforms', async () => {
    const { fetch } = mockFetch(json({ data: product }));
    const response = await client(fetch).get('/products/p1', {
      schema: v.object({ title: v.string() }).transform(({ title }) => title.toUpperCase()),
    });

    expectTypeOf(response.data).toEqualTypeOf<string>();
    expect(response.data).toBe('FAQ 101');
  });

  it('validates a collection', async () => {
    const { fetch } = mockFetch(json({ data: [product, { ...product, id: 'p2' }] }));
    const response = await client(fetch).get('/products', { schema: v.array(schema) });

    expect(response.data.map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('throws JsonApiSchemaError with the path of each issue, and no response body', async () => {
    const { fetch } = mockFetch(json({ data: [product, { type: 'products', id: 'p2', attributes: { secret: 'value' } }] }));
    const error = await failure(() => client(fetch).get('/products', { schema: v.array(schema) }));

    expect(isJsonApiSchemaError(error)).toBe(true);
    expect(isJsonApiError(error)).toBe(false);
    const drift = error as JsonApiSchemaError;
    expect(drift.status).toBe(200);
    expect(drift.method).toBe('GET');
    expect(drift.url).toBe('https://example.com/jsonapi/products');
    expect(drift.issues).toHaveLength(1);
    expect(drift.issues[0]!.path).toEqual([1, 'title']);
    expect(drift.message).toContain('1.title: ');
    expect(JSON.stringify(drift)).not.toContain('value');
    expect(drift.message).not.toContain('value');
  });

  it('reports how many issues there are', async () => {
    const { fetch } = mockFetch(json({ data: { type: 'products', id: 'p1', attributes: {} } }));
    const error = await failure(() => client(fetch).get('/products/p1', {
      schema: v.object({ title: v.string(), subtitle: v.string(), sku: v.string() }),
    }));

    expect((error as JsonApiSchemaError).message).toContain('(and 2 more)');
  });

  it('leaves an HTTP error as JsonApiError, without running the schema', async () => {
    const validate = vi.fn();
    const spy: StandardSchemaV1 = { '~standard': { version: 1, vendor: 'test', validate } };
    const { fetch } = mockFetch(json({ errors: [{ status: '404', detail: 'Not found' }] }, 404));
    const error = await failure(() => client(fetch).get('/products/p1', { schema: spy }));

    expect(error).toBeInstanceOf(JsonApiError);
    expect(validate).not.toHaveBeenCalled();
  });

  it('leaves a 2xx that is not JSON as JsonApiError, without running the schema', async () => {
    const validate = vi.fn();
    const spy: StandardSchemaV1 = { '~standard': { version: 1, vendor: 'test', validate } };
    const fetch = (async () => new Response('<b>Notice</b>', { status: 200 })) as typeof globalThis.fetch;
    const error = await failure(() => client(fetch).get('/products/p1', { schema: spy }));

    expect(error).toBeInstanceOf(JsonApiError);
    expect(validate).not.toHaveBeenCalled();
  });

  it('accepts a validator that is async and uses path segment objects', async () => {
    const asyncSchema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({ issues: [{ message: 'nope', path: [{ key: 'title' }] }] }),
      },
    };
    const { fetch } = mockFetch(json({ data: product }));
    const error = await failure(() => client(fetch).get('/products/p1', { schema: asyncSchema }));

    expect((error as JsonApiSchemaError).issues).toEqual([{ message: 'nope', path: ['title'] }]);
  });

  it('calls onResponse before validating, so the body of a failed response can be inspected', async () => {
    const onResponse = vi.fn();
    const { fetch } = mockFetch(json({ data: { type: 'products', id: 'p1', attributes: {} } }));
    await failure(() => client(fetch, { onResponse }).get('/products/p1', { schema }));

    expect(onResponse).toHaveBeenCalledOnce();
  });

  it('works on post, patch, delete and request', async () => {
    const { fetch, calls } = mockFetch(json({ data: product }));
    const drupal = client(fetch);

    expect((await drupal.post('/products', { data: {} }, { schema })).data.title).toBe('FAQ 101');
    expect((await drupal.patch('/products/p1', { data: {} }, { schema })).data.title).toBe('FAQ 101');
    expect((await drupal.delete('/products/p1', undefined, { schema })).data.title).toBe('FAQ 101');
    expect((await drupal.request('PUT', '/products/p1', { schema })).data.title).toBe('FAQ 101');
    expect(calls.map((call) => call.method)).toEqual(['POST', 'PATCH', 'DELETE', 'PUT']);
    expect(calls[0]!.body).toEqual({ data: {} });
  });

  it('passes an empty response to the schema as null', async () => {
    const fetch = (async () => new Response(null, { status: 204 })) as typeof globalThis.fetch;

    const accepted = await client(fetch).delete('/products/p1', undefined, { schema: v.null() });
    expect(accepted.data).toBeNull();
    expect(await failure(() => client(fetch).delete('/products/p1', undefined, { schema }))).toBeInstanceOf(JsonApiSchemaError);
  });

  it('validates plain JSON and text responses too', async () => {
    const plain = mockFetch(json({ message: 'hello' }));
    const body = await client(plain.fetch).get('/plain', { parse: 'json', schema: v.object({ message: v.string() }) });
    expect(body.data.message).toBe('hello');

    const text = (async () => new Response('token-1')) as typeof globalThis.fetch;
    const token = await client(text).get('/token', { parse: 'text', schema: v.string().min(1) });
    expect(token.data).toBe('token-1');
  });

  it('does not change a request without a schema', async () => {
    const { fetch } = mockFetch(json({ data: product }));
    const response = await client(fetch).get<{ id: string }>('/products/p1');

    expectTypeOf(response.data).toEqualTypeOf<{ id: string }>();
    expect(response.data).toMatchObject({ id: 'p1', title: 'FAQ 101', weight: 3 });
  });

  it('is not accepted by the resource methods, where the type comes from the registry', () => {
    const drupal = new JsonApiClient({ baseUrl: 'https://example.com' });
    // @ts-expect-error `schema` belongs to the request methods.
    const call = () => drupal.getResource('products', 'p1', { schema });
    expect(call).toBeTypeOf('function');
  });
});
