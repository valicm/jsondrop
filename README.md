# jsondrop

TypeScript clients for Drupal's JSON:API, with types for Drupal core and
Drupal Commerce that projects extend with their own. Framework-agnostic:
built on `fetch`, runs in Node 20.19+, edge runtimes and browsers.

| Package | Status | Contents |
|---|---|---|
| [`@jsondrop/core`](packages/core) | in progress | Client, query builder, deserializer, auth, type registry |
| [`@jsondrop/drupal`](packages/drupal) | in progress | Drupal core entity types, decoupled_router, menus, views, images |
| [`@jsondrop/commerce`](packages/commerce) | in progress | Commerce types; commerce_api cart, checkout and payment |

Targets Drupal 11 and later.

**Extending** for your site: see [examples](examples), which cover your own
bundles and fields, auth, headers, renamed resources, Commerce subclasses
and cart tokens.

## Development

```sh
npm install
npm run check      # typecheck, test, build
npm run changeset  # describe a change for the next release
```

## License

[MIT](LICENSE.md) © Valentino Međimorec
