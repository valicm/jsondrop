# @jsondrop/webform

## 0.1.0

### Minor Changes

- f9af500: New package, `@jsondrop/webform`, for Webform through webform_rest. It loads a webform and normalizes it into fields a frontend can render, evaluates `#states` conditional logic, and submits with per-field validation errors. It can also read and update submissions.
  
  - `@jsondrop/core`: new `parse` request option (`'json'` or `'text'`) for Drupal endpoints that aren't JSON:API.
  - `@jsondrop/drupal`: new `getCsrfToken()`, for core REST writes authenticated with a session cookie. The login and router helpers now use plain JSON parsing.

### Patch Changes

- Updated dependencies [f9af500]
  - @jsondrop/core@0.1.1
