# Extending: examples

The packages cover what every Drupal site shares. Everything specific to a
site plugs in at one of these points:

| You have | Extend with | Example |
|---|---|---|
| Your own bundles and fields | Interfaces extending `Node`, `Term`, `Paragraph`, `Product`, … registered in `ResourceTypes` | [01](01-content-types.ts), [04](04-commerce-types.ts) |
| A field type from a contrib module | An interface used in your bundles | [01](01-content-types.ts) |
| Your own auth (API key, a token you refresh) | An `AuthStrategy` | [03](03-client-setup.ts) |
| Headers a custom module reads (region, currency) | `headers`, or `client.extend({ headers })` | [03](03-client-setup.ts), [05](05-commerce-subclass.ts) |
| Resources renamed with JSON:API Extras, another API prefix | `resourcePaths`, `resolveResourcePath`, `apiPrefix` | [03](03-client-setup.ts) |
| Several audiences (public, customer, preview) | `client.extend()` | [03](03-client-setup.ts) |
| Framework caching (Next.js `revalidate`, tags) | `fetchOptions`, per client or per request | [03](03-client-setup.ts) |
| Logging, a request inspector | `onResponse` | [03](03-client-setup.ts) |
| Commerce endpoints of your modules, another payment flow | A `CommerceApi` subclass | [05](05-commerce-subclass.ts) |
| A cart token in your framework's cookies | `withCartToken()` | [06](06-server-cart-token.ts) |
| Users logging in (OAuth or Drupal session) | `OAuthClient` + `strategy(store)`, or `login()` + `sessionCookie()` | [07](07-user-login.ts) |
| Webforms rendered by your frontend | `getWebform()`, `fieldState()`, `submitWebform()` | [08](08-webform.ts) |
| Runtime validation of responses | The `schema` request option, with any Standard Schema | [09](09-validating-responses.ts) |

Read them in order:

1. [Typing content](01-content-types.ts): bundles, paragraphs as a
   union, contrib field types.
2. [Reading content](02-reading-content.ts): includes, sparse fieldsets,
   filter groups, paging, path lookup, menus, narrowing paragraph unions.
3. [Client setup](03-client-setup.ts): auth strategies, headers, renamed
   resources, audiences, logging.
4. [Typing commerce](04-commerce-types.ts): product and variation
   bundles, attributes, order fields.
5. [Extending CommerceApi](05-commerce-subclass.ts): custom headers and
   endpoints, changed defaults, a payment flow with a 3-D Secure step, a
   whole checkout.
6. [Cart token on the server](06-server-cart-token.ts): cookies, with
   the Next.js wiring.
7. [User login](07-user-login.ts): OAuth with PKCE and refresh tokens,
   or a Drupal session; current user; logout.
8. [Webform](08-webform.ts): a framework-free form controller with
   conditional fields and per-field errors.
9. [Validating responses](09-validating-responses.ts): your own schemas,
   telling a missing resource from a response you do not understand.

The examples are typechecked with the packages (`npm run typecheck`), and
[examples.test.ts](examples.test.ts) runs example 5's checkout against a
fake commerce_api.

## Rules of thumb

- **Register types, don't cast.** A registered type makes every call typed:
  `getResource`, `getCollection`, `iterate`, and relationships that point
  at it.
- **Relationships may be stubs.** A target that was not in `include` is
  `{ id, type, stub: true }`. Check with `isStub()` before reading fields.
- **Keep project logic in the project.** Mapping resources to view models,
  market rules and custom payment flows belong in your app or your
  subclass, not in a fork of the packages.
- **Secrets stay on the server.** OAuth client secrets and cart tokens never
  reach the browser; call Drupal from server code.
