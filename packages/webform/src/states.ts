import type { WebformField } from './elements.js';

/**
 * Evaluates `#states` (Drupal's Form API states, as Webform configures
 * them) against the current form values, so a frontend can show, hide,
 * require and disable fields the way Drupal's states.js would.
 *
 * Conditions:
 * - an object is "all of": `{ ':input[name="a"]': { value: 'x' }, … }`;
 * - an array is "any of" (`[{…}, 'or', {…}]`), or "exactly one of" with
 *   `'xor'` among its items;
 * - triggers: `value` (a value, or `{ pattern }`, `{ '!pattern' }`,
 *   `{ greater }`, `{ greater_equal }`, `{ less }`, `{ less_equal }`,
 *   `{ between: 'min:max' }`), `checked`, `unchecked`, `empty`, `filled`.
 *
 * Selectors are read by their `name`: `:input[name="contact"]` is
 * `values.contact`; `name="topics[news]"` is the `news` checkbox of the
 * `topics` checkboxes, or the `news` part of a composite. Unknown triggers
 * count as met, so an unsupported condition never hides a field.
 */

export interface FieldState {
  visible: boolean;
  required: boolean;
  disabled: boolean;
  readonly: boolean;
}

type Values = Record<string, unknown>;

/** A field's state for the given values. */
export function fieldState(field: Pick<WebformField, 'access' | 'kind' | 'required' | 'disabled' | 'readonly' | 'states'>, values: Values): FieldState {
  const state: FieldState = {
    visible: field.access && field.kind !== 'hidden',
    required: field.required,
    disabled: field.disabled,
    readonly: field.readonly,
  };
  for (const [rawName, conditions] of Object.entries(field.states ?? {})) {
    const negate = rawName.startsWith('!');
    const name = negate ? rawName.slice(1) : rawName;
    const met = evaluate(conditions, values) !== negate;
    switch (name) {
      case 'visible':
      case 'visible-slide':
        state.visible = state.visible && met;
        break;
      case 'invisible':
      case 'invisible-slide':
        state.visible = state.visible && !met;
        break;
      case 'required':
        state.required = met;
        break;
      case 'optional':
        state.required = !met;
        break;
      case 'disabled':
        state.disabled = met;
        break;
      case 'enabled':
        state.disabled = !met;
        break;
      case 'readonly':
        state.readonly = met;
        break;
      case 'readwrite':
        state.readonly = !met;
        break;
    }
  }
  return state;
}

/** Whether a `#states` condition set is met. */
export function evaluate(conditions: unknown, values: Values): boolean {
  if (Array.isArray(conditions)) {
    const items = conditions.filter((item) => typeof item === 'object' && item !== null);
    const results = items.map((item) => evaluate(item, values));
    if (conditions.includes('xor')) return results.filter(Boolean).length === 1;
    return results.some(Boolean);
  }
  if (typeof conditions !== 'object' || conditions === null) {
    return true;
  }
  return Object.entries(conditions).every(([selector, trigger]) => {
    // A nested condition set (Webform writes groups this way).
    if (/^\d+$/.test(selector) || Array.isArray(trigger) && !selectorName(selector)) return evaluate(trigger, values);
    return triggerMet(read(selector, values), trigger);
  });
}

/** The value a selector points at. */
function read(selector: string, values: Values): Input {
  const name = selectorName(selector);
  if (!name) return { value: undefined };
  const [key, ...parts] = name.replace(/\]/g, '').split('[').filter((part, index) => index === 0 || part !== '');
  let value: unknown = key === undefined ? undefined : values[key];
  for (const part of parts) {
    if (Array.isArray(value)) {
      // A checkboxes option: `topics[news]` is checked when listed.
      return { value: value.map(String).includes(part) ? part : undefined, option: part, checkbox: true };
    }
    value = typeof value === 'object' && value !== null ? (value as Values)[part] : undefined;
  }
  return { value };
}

interface Input {
  value: unknown;
  /** For a checkboxes option: the option it is. */
  option?: string;
  checkbox?: boolean;
}

function selectorName(selector: string): string | null {
  const match = /name=(?:"([^"]+)"|'([^']+)'|([^\]\s]+))/.exec(selector);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function triggerMet(input: Input, trigger: unknown): boolean {
  if (typeof trigger !== 'object' || trigger === null) return true;
  return Object.entries(trigger as Record<string, unknown>).every(([name, expected]) => {
    switch (name) {
      case 'value':
        return valueMatches(input.value, expected);
      case 'checked':
        return isChecked(input) === Boolean(expected);
      case 'unchecked':
        return isChecked(input) !== Boolean(expected);
      case 'empty':
        return isEmpty(input.value) === Boolean(expected);
      case 'filled':
        return isEmpty(input.value) !== Boolean(expected);
      default:
        return true;
    }
  });
}

function valueMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => valueMatches(item, expected));
  }
  if (typeof expected === 'object' && expected !== null) {
    const rule = expected as Record<string, unknown>;
    const text = actual === undefined || actual === null ? '' : String(actual);
    const number = Number(text);
    if ('pattern' in rule) return safeRegExp(rule.pattern)?.test(text) ?? false;
    if ('!pattern' in rule) return !(safeRegExp(rule['!pattern'])?.test(text) ?? true);
    if (text === '' || Number.isNaN(number)) return false;
    if ('greater' in rule) return number > Number(rule.greater);
    if ('greater_equal' in rule) return number >= Number(rule.greater_equal);
    if ('less' in rule) return number < Number(rule.less);
    if ('less_equal' in rule) return number <= Number(rule.less_equal);
    if ('between' in rule) {
      const [min, max] = String(rule.between).split(':').map(Number);
      return (min === undefined || Number.isNaN(min) || number >= min) && (max === undefined || Number.isNaN(max) || number <= max);
    }
    return true;
  }
  return String(actual ?? '') === String(expected ?? '');
}

function isChecked(input: Input): boolean {
  if (input.checkbox) return input.value !== undefined;
  const value = input.value;
  return value === true || value === 1 || value === '1' || (typeof value === 'string' && value !== '' && value !== '0');
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(isEmpty);
  return false;
}

function safeRegExp(pattern: unknown): RegExp | null {
  try {
    return new RegExp(String(pattern));
  }
  catch {
    return null;
  }
}
