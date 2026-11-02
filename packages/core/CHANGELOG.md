# @jsondrop/core

## 0.2.0

### Minor Changes

- bd518de: New `schema` option on `get`, `post`, `patch`, `delete` and `request`, for validating responses at runtime with any Standard Schema (Zod, Valibot, ArkType, …), with no new dependency. It runs on `data` after deserialization, types `data` from the schema's output, and throws the new `JsonApiSchemaError` on a mismatch.

## 0.1.1

### Patch Changes

- f9af500: New package, `@jsondrop/webform`, for Webform through webform_rest. It loads a webform and normalizes it into fields a frontend can render, evaluates `#states` conditional logic, and submits with per-field validation errors. It can also read and update submissions.
  
  - `@jsondrop/core`: new `parse` request option (`'json'` or `'text'`) for Drupal endpoints that aren't JSON:API.
  - `@jsondrop/drupal`: new `getCsrfToken()`, for core REST writes authenticated with a session cookie. The login and router helpers now use plain JSON parsing.

## 0.1.0

### Minor Changes

- 24490a4: First release.
  
  - `@jsondrop/core`: a typed JSON:API client for Drupal with no dependencies. Includes a query builder, deserializer, resource type registry, path discovery, and auth strategies: bearer token, basic, session cookie, OAuth client credentials, and OAuth user login with PKCE and refresh tokens.
  - `@jsondrop/drupal`: Drupal 11 core entity types and helpers for decoupled_router, menus, views, images, the current user and session login.
  - `@jsondrop/commerce`: Drupal Commerce types and a commerce_api client covering the cart, coupons, checkout, shipping and payments, plus commerce_variation_bundle support.
