---
"@jsondrop/webform": minor
"@jsondrop/core": patch
"@jsondrop/drupal": patch
---

New package, `@jsondrop/webform`, for Webform through webform_rest. It loads a webform and normalizes it into fields a frontend can render, evaluates `#states` conditional logic, and submits with per-field validation errors. It can also read and update submissions.

- `@jsondrop/core`: new `parse` request option (`'json'` or `'text'`) for Drupal endpoints that aren't JSON:API.
- `@jsondrop/drupal`: new `getCsrfToken()`, for core REST writes authenticated with a session cookie. The login and router helpers now use plain JSON parsing.
