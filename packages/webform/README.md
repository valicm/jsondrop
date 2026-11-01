# @jsondrop/webform

Webform for decoupled Drupal, through the
[webform_rest](https://www.drupal.org/project/webform_rest) module: load a
webform, render it in any framework, evaluate its conditional logic
(`#states`), and submit it with Webform's own validation.

```sh
npm install @jsondrop/core @jsondrop/webform
```

## Drupal setup

1. Install webform_rest (4.x) and enable its REST resources "Webform
   Elements", "Webform Submit" and, to read or update submissions,
   "Webform Submission".
2. Grant the REST permissions (e.g. "restful get webform_rest_elements",
   "restful post webform_rest_submit") to the roles that use them, and give
   those roles access to create submissions of the webforms.

## Why webform_rest and not JSON:API

Core JSON:API exposes the webform config entity (`webform--webform`) read
only, with its elements as YAML source, and creating a submission through
JSON:API skips Webform's form validation. webform_rest serves the built
element tree and submits through Webform's submission form: same
validation, handlers (emails, remote posts) and confirmation settings as on
the Drupal site. The JSON:API types are registered anyway, for listing
webforms or reading their status.

## Usage

```ts
import { JsonApiClient } from '@jsondrop/core';
import { defaultValues, fieldState, getWebform, submitWebform, WebformValidationError } from '@jsondrop/webform';

const drupal = new JsonApiClient({ baseUrl: 'https://cms.example.com' });

const webform = await getWebform(drupal, 'contact');
let values = defaultValues(webform.fields);

// Render webform.fields: each has key, type, kind, title, required,
// options, children…; fieldState() says whether it is visible, required
// or disabled for the current values.
for (const field of webform.fields) {
  const { visible, required } = fieldState(field, values);
}

try {
  const { sid, confirmation } = await submitWebform(drupal, 'contact', values);
}
catch (error) {
  if (error instanceof WebformValidationError) {
    error.errorFor('email'); // Webform's message for the field
  }
}
```

### The form model

`normalizeElements()` (and `getWebform()`) turn Webform's render arrays
into `WebformField`s:

| Kind | Types | Renders as |
|---|---|---|
| `input` | textfield, email, tel, number, textarea, select, radios, checkboxes, checkbox, date, … | A control; its value goes in the submission under `key` |
| `composite` | webform_address, webform_name, webform_contact, custom composites | Its `children` as one value: an object keyed by sub-element |
| `container` | fieldset, details, container, webform_section, webform_flexbox | A group around its `children` |
| `page` | webform_wizard_page, webform_card | One step of a multi-step form (`wizardPages()`) |
| `markup` | webform_markup, processed_text, webform_message, … | `markup` (HTML) |
| `actions` | webform_actions | The submit button (`properties.submit__label`) |
| `hidden` | hidden, value | Nothing; its value is still submitted |

Every `#` property is also in `properties`, without the `#`. Fields with
`access: false` are not to be rendered. Helpers: `inputFields()` (every
field that submits a value), `defaultValues()`, `wizardPages()`.

Values follow Webform's submission format: checkboxes and multiple values
as lists, composites as objects.

### Conditional logic

`fieldState(field, values)` evaluates `#states` the way Drupal's states.js
does: `visible`/`invisible`, `required`/`optional`, `enabled`/`disabled`,
`readonly`/`readwrite`, with conditions on values (exact, pattern, ranges),
`checked`/`unchecked` and `empty`/`filled`, combined as all, any (`or`) or
exactly one (`xor`). Unsupported triggers count as met, so they never hide
a field.

### Errors

- `WebformValidationError`: Webform rejected the values. `errors` holds
  the messages by element (`address][city` for composite parts);
  `errorFor(key)` finds a field's.
- `WebformError`: the form is closed, the user may not submit it, or
  drafts are not allowed.

### Sessions and CSRF

Submits authenticated by a Drupal session cookie need Drupal's CSRF token:
pass `csrfToken` (from `login()`, or `getCsrfToken()` in
`@jsondrop/drupal`). Anonymous submits and bearer tokens need none.

### Not covered

- File uploads: webform_rest has no upload endpoint; file elements need a
  site-specific one.
- Webform's client-side validation rules beyond `required` (patterns,
  min/max): read them from `properties` (`pattern`, `min`, `max`,
  `maxlength`) if you want them before submit; Webform checks them on
  submit either way.
- Option order for numeric option values: JSON objects sort integer-like
  keys, so `"10"` comes after `"2"` whatever the webform's order.
