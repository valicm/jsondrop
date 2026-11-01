/**
 * Webform's element tree, and a normalized form model to render from.
 *
 * webform_rest serves elements as Drupal render arrays: properties are keys
 * starting with `#` (`#type`, `#title`, `#required`), children are the
 * other keys, nested to any depth (fieldsets, wizard pages, composites).
 * {@link normalizeElements} turns that into plain {@link WebformField}s.
 */

/** A raw element, as webform_rest returns it. */
export interface WebformElement {
  '#type'?: string;
  '#title'?: unknown;
  [key: string]: unknown;
}

/** The raw element tree: element key → element. */
export type WebformElements = Record<string, WebformElement>;

/**
 * What a field is, for rendering:
 * - `input`: collects a value (textfield, email, select, checkboxes, …);
 * - `composite`: an input made of sub-inputs, submitted as one object
 *   (webform_address, webform_name, webform_contact, custom composites);
 * - `container`: groups children, submits nothing (fieldset, details,
 *   container, webform_section, webform_flexbox);
 * - `page`: a wizard page or card; children are the page's fields;
 * - `markup`: text to show (webform_markup, processed_text, …);
 * - `actions`: the submit buttons (webform_actions);
 * - `hidden`: submitted but not shown (hidden, value).
 */
export type WebformFieldKind = 'input' | 'composite' | 'container' | 'page' | 'markup' | 'actions' | 'hidden';

export interface WebformOption {
  value: string;
  label: string;
  /** The optgroup, for grouped options. */
  group?: string;
}

/** A normalized element. */
export interface WebformField {
  /** Element key: the submission data key for inputs. */
  key: string;
  /** `#type`, e.g. `textfield`, `webform_address`. */
  type: string;
  kind: WebformFieldKind;
  title: string | null;
  description: string | null;
  help: string | null;
  required: boolean;
  requiredError: string | null;
  placeholder: string | null;
  defaultValue: unknown;
  /** `#multiple`: true, or the maximum number of values. */
  multiple: boolean | number;
  /** For select, radios, checkboxes and similar; NULL for other types. */
  options: WebformOption[] | null;
  /** The text of markup elements (HTML). */
  markup: string | null;
  /** `#access: false`: not to be rendered at all. */
  access: boolean;
  disabled: boolean;
  readonly: boolean;
  /** `#states`: conditions, see {@link fieldState}. */
  states: Record<string, unknown> | null;
  /** Children: of containers and pages, and a composite's sub-inputs. */
  children: WebformField[];
  /** Every `#` property, without the `#`, for anything not mapped above. */
  properties: Record<string, unknown>;
}

const CONTAINERS = new Set(['fieldset', 'details', 'container', 'webform_section', 'webform_flexbox', 'webform_table', 'webform_table_row', 'item']);
const PAGES = new Set(['webform_wizard_page', 'webform_card']);
const MARKUP = new Set(['webform_markup', 'processed_text', 'webform_message', 'webform_horizontal_rule', 'webform_more', 'label', 'webform_section_title', 'webform_image_file', 'webform_video_file', 'webform_audio_file']);
const COMPOSITES = new Set(['webform_address', 'webform_name', 'webform_contact', 'webform_link', 'webform_location_geocomplete', 'webform_location_places', 'webform_telephone', 'webform_custom_composite', 'webform_composite']);
const HIDDEN = new Set(['hidden', 'value', 'webform_computed_token', 'webform_computed_twig']);

/** The normalized fields of an element tree, in order. */
export function normalizeElements(elements: WebformElements | null | undefined): WebformField[] {
  return children(elements ?? {});
}

function children(element: Record<string, unknown>): WebformField[] {
  const entries = Object.entries(element).filter(
    (entry): entry is [string, WebformElement] => !entry[0].startsWith('#') && isElement(entry[1]),
  );
  // Respect #weight when every sibling has one; otherwise keep the given order.
  if (entries.length > 1 && entries.every(([, child]) => typeof child['#weight'] === 'number')) {
    entries.sort(([, a], [, b]) => (a['#weight'] as number) - (b['#weight'] as number));
  }
  return entries.map(([key, child]) => normalize(key, child));
}

function normalize(key: string, element: WebformElement): WebformField {
  const type = typeof element['#type'] === 'string' ? element['#type'] : 'markup';
  const properties: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(element)) {
    if (name.startsWith('#')) properties[name.slice(1)] = value;
  }
  const kind = kindOf(type, element);
  return {
    key: typeof element['#webform_key'] === 'string' ? element['#webform_key'] : key,
    type,
    kind,
    title: text(element['#title']),
    description: text(element['#description']),
    help: text(element['#help']),
    required: element['#required'] === true || element['#required'] === 'required',
    requiredError: text(element['#required_error']),
    placeholder: text(element['#placeholder']),
    defaultValue: element['#default_value'] ?? null,
    multiple: typeof element['#multiple'] === 'number' ? element['#multiple'] : element['#multiple'] === true,
    options: normalizeOptions(element['#options']),
    markup: kind === 'markup' ? text(element['#markup'] ?? element['#text'] ?? element['#message_message']) : null,
    access: element['#access'] !== false,
    disabled: element['#disabled'] === true,
    readonly: element['#readonly'] === true,
    states: isRecord(element['#states']) ? element['#states'] : null,
    children: children(element),
    properties,
  };
}

function kindOf(type: string, element: WebformElement): WebformFieldKind {
  if (type === 'webform_actions') return 'actions';
  if (PAGES.has(type)) return 'page';
  if (HIDDEN.has(type)) return 'hidden';
  if (MARKUP.has(type)) return 'markup';
  if (COMPOSITES.has(type) || element['#webform_composite'] === true) return 'composite';
  if (CONTAINERS.has(type)) return 'container';
  return 'input';
}

/**
 * `#options` as a list. Takes `{value: label}`, optgroups
 * (`{group: {value: label}}`) and lists of `{value, text}`. An options ID
 * (`"country_names"`, from the fields endpoint) gives NULL: the elements
 * endpoint expands them.
 *
 * JSON objects reorder integer-like keys (`"10"` before `"2"` becomes
 * `"2"`, `"10"`), so numeric option values come back sorted, whatever the
 * webform's order.
 */
export function normalizeOptions(options: unknown): WebformOption[] | null {
  if (Array.isArray(options)) {
    return options.flatMap((option): WebformOption[] => {
      if (isRecord(option)) return [{ value: String(option.value ?? option.key ?? ''), label: text(option.text ?? option.label ?? option.value) ?? '' }];
      return option === null || option === undefined ? [] : [{ value: String(option), label: String(option) }];
    });
  }
  if (!isRecord(options)) {
    return null;
  }
  return Object.entries(options).flatMap(([value, label]): WebformOption[] => {
    if (isRecord(label) && !('#markup' in label)) {
      return Object.entries(label).map(([inner, innerLabel]) => ({ value: inner, label: text(innerLabel) ?? inner, group: value }));
    }
    return [{ value, label: text(label) ?? value }];
  });
}

/**
 * Every field that submits a value (inputs, composites, hidden), found
 * through containers and pages, in order.
 */
export function inputFields(fields: WebformField[]): WebformField[] {
  return fields.flatMap((field) => {
    if (field.kind === 'input' || field.kind === 'composite' || field.kind === 'hidden') return [field];
    return inputFields(field.children);
  });
}

/** The wizard pages, when the webform has them. */
export function wizardPages(fields: WebformField[]): WebformField[] {
  return fields.filter((field) => field.kind === 'page');
}

/**
 * Initial values for a form: each input's default value, or an empty value
 * of the right shape (an empty list for multiple values and checkboxes, an
 * object for composites).
 */
export function defaultValues(fields: WebformField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of inputFields(fields)) {
    if (field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== '') {
      values[field.key] = field.defaultValue;
    }
    else if (field.kind === 'composite') {
      values[field.key] = field.multiple ? [] : {};
    }
    else if (field.multiple || field.type === 'checkboxes' || field.type === 'webform_checkboxes_other') {
      values[field.key] = [];
    }
    else {
      values[field.key] = '';
    }
  }
  return values;
}

function isElement(value: unknown): value is WebformElement {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text from a property that may be a string or a render array (`#markup`). */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number') return String(value);
  if (isRecord(value)) return text(value['#markup'] ?? value['#plain_text'] ?? value['#text']);
  return null;
}
