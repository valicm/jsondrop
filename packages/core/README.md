# @jsondrop/core

A typed, framework-agnostic client for Drupal's JSON:API. No dependencies.

```sh
npm install @jsondrop/core
```

## Usage

```ts
import { JsonApiClient, clientCredentials } from '@jsondrop/core';

const drupal = new JsonApiClient({
  baseUrl: 'https://cms.example.com',
  auth: clientCredentials({ clientId: '…', clientSecret: '…', scope: 'content:read' }),
});

const articles = await drupal.getCollection('node--article', {
  query: {
    include: ['field_image', 'uid'],
    filter: { status: 1 },
    sort: ['-created'],
    page: { limit: 10 },
  },
});

articles[0].field_image; // the included file--file, with relationshipMeta.alt
```

Responses are deserialized: attributes and relationships sit on one
object, and relationships are replaced by their included resources
(recursively). A relationship whose target was not included is a stub
(`{ id, type, stub: true }`, see `isStub`).

## Typing your resources

Register resource types once, by declaration merging:

```ts
import type { ResourceBase, ToOne, ToMany } from '@jsondrop/core';

interface NodeArticle extends ResourceBase<'node--article'> {
  title: string;
  body: { value: string; processed: string } | null;
  field_tags: ToMany<TaxonomyTerm>;
  field_image: ToOne<File>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'node--article': NodeArticle;
  }
}

const article = await drupal.getResource('node--article', id); // NodeArticle
```

## API

**Resources**: `getResource`, `getCollection`, `getPage` (with `next()`),
`iterate` (async, follows `next` links), `createResource`, `updateResource`,
`deleteResource`, `uploadFile`.

**Requests** relative to the API prefix, for custom resources:
`get`, `post`, `patch`, `delete`, `request`. They return the raw document
alongside `data`, `meta`, `links`, `status` and `headers`.

**Options** (client, some per request):

| Option | |
|---|---|
| `baseUrl` | Site origin |
| `apiPrefix` | Default `/jsonapi` |
| `locale`, `defaultLocale` | Language path prefix (`/de/jsonapi/…`) |
| `auth` | `bearer`, `basic`, `sessionCookie`, `clientCredentials`, or your own `AuthStrategy`; `false` per request |
| `headers` | Object or (async) function |
| `resourcePaths` | Type → path, for types renamed with JSON:API Extras |
| `fetchOptions` | Passed to `fetch`, e.g. `{ next: { revalidate: 60, tags: ['node:1'] } }` |
| `onResponse` | Called after each request, for logging |

## Validating responses

The request methods take a `schema`: any
[Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, …).
jsondrop has no dependency on them and bundles no schemas, because your fields
are specific to your site.

```ts
import { z } from 'zod';

const { data } = await drupal.get(`/products/${id}`, {
  schema: z.object({ id: z.string(), title: z.string() }),
});
// data: { id: string; title: string }
```

The schema runs on `data` after deserialization, so it describes the resource,
not the JSON:API document. `data` becomes the schema's output, typed from it.
A mismatch throws `JsonApiSchemaError` with `issues` (a `message` and `path`
each). It is not a `JsonApiError`: the request succeeded and your site and
schema disagree. It carries no response body; `onResponse` has already seen
that. One bad item fails a whole collection. See
[the example](https://github.com/valicm/jsondrop/blob/main/examples/09-validating-responses.ts)
for a listing that skips bad items instead.

The resource methods (`getResource`, `getCollection`, …) don't take a schema:
their types come from the `ResourceTypes` registry.

## Users logging in (OAuth)

`OAuthClient` runs simple_oauth 6.x's authorization code flow with PKCE
and refresh tokens (6.x dropped the password and implicit grants):

```ts
import { OAuthClient } from '@jsondrop/core';

const oauth = new OAuthClient({ baseUrl, clientId, clientSecret, redirectUri, scope: 'openid profile' });

// 1. Redirect to Drupal; keep state + codeVerifier in an httpOnly cookie.
const { url, state, codeVerifier } = await oauth.startLogin();
// 2. On the redirect back: checks the state, exchanges the code.
const tokens = await oauth.finishLogin({ code, state: returnedState }, { state, codeVerifier });
// 3. Store the tokens server-side; requests as the user:
const asUser = drupal.extend({ auth: oauth.strategy(tokenStore) });
```

The strategy refreshes the token before it expires and after a 401.
Refresh tokens are single-use, so concurrent refreshes share one request:
keep one `OAuthClient` per app. When Drupal rejects the refresh token, the
store is emptied and requests throw `LoginRequiredError`: send the user to
log in again. `oauth.userInfo(accessToken)` reads OpenID Connect claims.
See [example 7](../../examples/07-user-login.ts).

**Renamed resources** (JSON:API Extras): the API's entry point lists every
type's path, so let the client read them once at startup instead of
mapping them by hand:

```ts
const drupal = await new JsonApiClient({ baseUrl }).withDiscoveredPaths();
drupal.resourcePath('products'); // '/products', as the site configures it
```

`client.extend({ headers })` derives a client that adds headers (a cart
token, a market) and shares the parent's auth and token cache.

**Errors**: non-2xx responses throw `JsonApiError` with `status`, `errors`
and the document; its `message` is Drupal's `detail`. On a 401, strategies
with cached tokens are renewed and the request retried once.

**Links**: absolute URLs from documents (`links.next`) are sent to
`baseUrl`'s origin, so a Drupal behind a proxy that builds links with an
internal host still works, and credentials never go elsewhere.

**Queries** also accept a prebuilt string, e.g. from drupal-jsonapi-params.
