# @jsondrop/drupal

Drupal 11 core entity types and helpers for
[`@jsondrop/core`](../core).

```sh
npm install @jsondrop/core @jsondrop/drupal
```

## Types

Importing the package registers Drupal core's resource types with the
client:

- fixed types: `user--user`, `file--file`, `menu_link_content--menu_link_content`,
  `path_alias--path_alias`, and the config entities (`node_type`,
  `taxonomy_vocabulary`, `media_type`, `user_role`, `block_content_type`);
- per-entity-type fallbacks: any `node--*` is a `Node`, `taxonomy_term--*` a
  `Term`, `media--*` a `Media`, `block_content--*` a `BlockContent`,
  `paragraph--*` a `Paragraph`, typed with the base fields.

Add your bundles' fields by extending them:

```ts
import type { ToMany, ToOne } from '@jsondrop/core';
import type { File, ImageMeta, MediaImage, Node, Term, TextField } from '@jsondrop/drupal';

export interface Article extends Node<'article'> {
  body: TextField | null;
  field_image: ToOne<File<ImageMeta>>;
  field_tags: ToMany<Term<'tags'>>;
  field_hero: ToOne<MediaImage>;
}

declare module '@jsondrop/core' {
  interface ResourceTypes {
    'node--article': Article;
  }
}
```

Field value types: `TextField`, `PathField`, `LinkField`, `FileUri`,
`ImageMeta`, `FileMeta`, `DateRangeField`, `AddressField`.
Standard-profile media types: `MediaImage`, `MediaDocument`, `MediaAudio`,
`MediaVideo`, `MediaRemoteVideo`.

## Helpers

| Helper | Needs | |
|---|---|---|
| `translatePath(client, path)` | decoupled_router | Resolves a path; NULL when not found |
| `getResourceByPath(client, path, options)` | decoupled_router | Resolves a path and fetches its entity, with redirects |
| `getMenu(client, menu)` / `getMenuItems` | jsonapi_menu_items | A menu as a sorted tree / flat list |
| `buildMenuTree(items)` | | Nests links by `parent`; also takes core `menu_link_content` |
| `getView(client, view, display, { filters, arguments, sort, page })` | jsonapi_views | A view display's results and count |
| `image(client, field)` | | An image field as `{ url, alt, title, width, height }` |
| `fileUrl(client, file)` | | Absolute file URL |
| `imageStyleUrl(file, style)` | consumer_image_styles | An image style derivative's URL |

### Users

| Helper | Needs | |
|---|---|---|
| `getCurrentUser(client)` / `getCurrentUserId` | | The logged-in user (any auth), from the entry point's `me` link; NULL when anonymous |
| `login(client, { name, pass })` | | Drupal session login (`/user/login`), server-side: returns the session cookie, CSRF and logout tokens |
| `logout(client, session)` | | Ends the session with its logout token |
| `isLoggedIn(client, cookie)` | | Whether a session is still valid |
| `requestPasswordReset(client, { mail })` | | Mails a reset link; same answer for unknown accounts |

For OAuth logins (simple_oauth) see `OAuthClient` in
`@jsondrop/core`. Both are shown in
[example 7](../../examples/07-user-login.ts).

```ts
const page = await getResourceByPath<Article>(drupal, '/blog/hello', {
  query: { include: ['field_image', 'field_tags'] },
});
if (!page?.resource) notFound();
```
