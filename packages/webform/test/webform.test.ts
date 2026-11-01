import { JsonApiClient } from '@jsondrop/core';
import { describe, expect, it } from 'vitest';
import {
  defaultValues,
  evaluate,
  fieldState,
  getSubmission,
  getWebform,
  inputFields,
  normalizeElements,
  submitWebform,
  updateSubmission,
  WebformError,
  WebformValidationError,
  wizardPages,
  type WebformElements,
} from '../src/index.js';
import { mockFetch } from '../../core/test/mock-fetch.js';

const BASE = 'https://cms.example.com';
const client = (fetch: typeof globalThis.fetch) => new JsonApiClient({ baseUrl: BASE, fetch });
const plain = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Shaped like webform_rest's /elements output for a contact form. */
const elements: WebformElements = {
  intro: { '#type': 'processed_text', '#text': '<p>Write to us.</p>', '#format': 'basic_html' },
  contact: {
    '#type': 'fieldset',
    '#title': 'Contact',
    name: { '#type': 'textfield', '#title': 'Name', '#required': true, '#required_error': 'Tell us your name.', '#webform_key': 'name' },
    email: { '#type': 'email', '#title': 'Email', '#placeholder': 'you@example.com', '#webform_key': 'email' },
    method: { '#type': 'radios', '#title': 'Reach me by', '#options': { email: 'Email', phone: 'Phone' }, '#default_value': 'email', '#webform_key': 'method' },
    phone: {
      '#type': 'tel',
      '#title': 'Phone',
      '#webform_key': 'phone',
      '#states': { visible: { ':input[name="method"]': { value: 'phone' } }, required: { ':input[name="method"]': { value: 'phone' } } },
    },
  },
  topic: {
    '#type': 'select',
    '#title': 'Topic',
    '#options': { Orders: { order_status: 'Order status', returns: 'Returns' }, other: 'Something else' },
    '#webform_key': 'topic',
  },
  interests: { '#type': 'checkboxes', '#title': 'Interests', '#options': { news: 'News', offers: 'Offers' }, '#webform_key': 'interests' },
  address: {
    '#type': 'webform_address',
    '#title': 'Address',
    '#webform_composite': true,
    '#webform_key': 'address',
    address: { '#type': 'textfield', '#title': 'Street' },
    city: { '#type': 'textfield', '#title': 'City' },
  },
  source: { '#type': 'hidden', '#default_value': 'web', '#webform_key': 'source' },
  internal: { '#type': 'textfield', '#title': 'Internal', '#access': false, '#webform_key': 'internal' },
  actions: { '#type': 'webform_actions', '#submit__label': 'Send' },
};

describe('normalizeElements', () => {
  const fields = normalizeElements(elements);

  it('keeps the tree, with kinds', () => {
    expect(fields.map((field) => `${field.key}:${field.kind}`)).toEqual([
      'intro:markup', 'contact:container', 'topic:input', 'interests:input', 'address:composite', 'source:hidden', 'internal:input', 'actions:actions',
    ]);
    expect(fields[0]!.markup).toBe('<p>Write to us.</p>');
    expect(fields[1]!.children.map((field) => field.key)).toEqual(['name', 'email', 'method', 'phone']);
    expect(fields.at(-1)!.properties.submit__label).toBe('Send');
  });

  it('maps common properties', () => {
    const name = fields[1]!.children[0]!;
    expect(name).toMatchObject({ type: 'textfield', title: 'Name', required: true, requiredError: 'Tell us your name.', access: true });
    expect(fields[1]!.children[1]!.placeholder).toBe('you@example.com');
    expect(fields.find((field) => field.key === 'internal')!.access).toBe(false);
  });

  it('flattens options, with groups', () => {
    expect(fields.find((field) => field.key === 'topic')!.options).toEqual([
      { value: 'order_status', label: 'Order status', group: 'Orders' },
      { value: 'returns', label: 'Returns', group: 'Orders' },
      { value: 'other', label: 'Something else' },
    ]);
  });

  it('lists inputs and default values', () => {
    expect(inputFields(fields).map((field) => field.key)).toEqual(['name', 'email', 'method', 'phone', 'topic', 'interests', 'address', 'source', 'internal']);
    expect(defaultValues(fields)).toEqual({ name: '', email: '', method: 'email', phone: '', topic: '', interests: [], address: {}, source: 'web', internal: '' });
  });

  it('finds wizard pages and sorts by weight when every sibling has one', () => {
    const wizard = normalizeElements({
      second: { '#type': 'webform_wizard_page', '#title': 'Two', '#weight': 2, b: { '#type': 'textfield' } },
      first: { '#type': 'webform_wizard_page', '#title': 'One', '#weight': 1, a: { '#type': 'textfield' } },
    });
    expect(wizardPages(wizard).map((page) => page.title)).toEqual(['One', 'Two']);
    expect(inputFields(wizard).map((field) => field.key)).toEqual(['a', 'b']);
  });
});

describe('#states', () => {
  const phone = normalizeElements(elements)[1]!.children[3]!;

  it('shows and requires a field on a value', () => {
    expect(fieldState(phone, { method: 'email' })).toMatchObject({ visible: false, required: false });
    expect(fieldState(phone, { method: 'phone' })).toMatchObject({ visible: true, required: true });
  });

  it('reads checkboxes options and composite parts', () => {
    const offers = { ':input[name="interests[offers]"]': { checked: true } };
    expect(evaluate(offers, { interests: ['offers'] })).toBe(true);
    expect(evaluate(offers, { interests: ['news'] })).toBe(false);
    expect(evaluate({ ':input[name="address[city]"]': { filled: true } }, { address: { city: 'Zagreb' } })).toBe(true);
    expect(evaluate({ ':input[name="address[city]"]': { empty: true } }, { address: {} })).toBe(true);
    expect(evaluate({ ':input[name="agree"]': { checked: true } }, { agree: 1 })).toBe(true);
    expect(evaluate({ ':input[name="agree"]': { unchecked: true } }, { agree: 0 })).toBe(true);
  });

  it('combines conditions: object is all, array any, xor exactly one', () => {
    const a = { ':input[name="a"]': { value: '1' } };
    const b = { ':input[name="b"]': { value: '1' } };
    expect(evaluate({ ...a, ...b }, { a: '1', b: '0' })).toBe(false);
    expect(evaluate([a, 'or', b], { a: '1', b: '0' })).toBe(true);
    expect(evaluate([a, 'or', b], { a: '0', b: '0' })).toBe(false);
    expect(evaluate([a, 'xor', b], { a: '1', b: '1' })).toBe(false);
    expect(evaluate([a, 'xor', b], { a: '1', b: '0' })).toBe(true);
  });

  it('compares with patterns and ranges', () => {
    const age = (rule: unknown) => ({ ':input[name="age"]': { value: rule } });
    expect(evaluate(age({ greater: 17 }), { age: '18' })).toBe(true);
    expect(evaluate(age({ less_equal: 17 }), { age: '18' })).toBe(false);
    expect(evaluate(age({ between: '18:65' }), { age: 30 })).toBe(true);
    expect(evaluate(age({ between: '18:65' }), { age: '' })).toBe(false);
    expect(evaluate({ ':input[name="zip"]': { value: { pattern: '^\\d{5}$' } } }, { zip: '10000' })).toBe(true);
    expect(evaluate({ ':input[name="zip"]': { value: { '!pattern': '^\\d{5}$' } } }, { zip: 'x' })).toBe(true);
  });

  it('handles negated and opposite states, and keeps #access', () => {
    const field = { ...phone, states: { '!visible': { ':input[name="method"]': { value: 'email' } }, disabled: { ':input[name="locked"]': { checked: true } } } };
    expect(fieldState(field, { method: 'email', locked: true })).toMatchObject({ visible: false, disabled: true });
    expect(fieldState(field, { method: 'phone' })).toMatchObject({ visible: true, disabled: false });
    expect(fieldState({ ...field, access: false }, { method: 'phone' }).visible).toBe(false);
    // Unknown triggers never hide anything.
    expect(evaluate({ ':input[name="x"]': { focused: true } }, {})).toBe(true);
  });
});

describe('webform_rest client', () => {
  it('reads and normalizes a webform', async () => {
    const { fetch, calls } = mockFetch(plain(elements));
    const webform = await getWebform(client(fetch), 'contact');
    expect(calls[0]!.url).toBe(`${BASE}/webform_rest/contact/elements?_format=json`);
    expect(calls[0]!.headers.get('Accept')).toBe('application/json');
    expect(webform.fields[1]!.children[0]!.title).toBe('Name');
  });

  it('submits values, with the CSRF token and confirmation', async () => {
    const { fetch, calls } = mockFetch(plain({ sid: 'uuid-1', confirmation_type: 'inline', confirmation_message: '<p>Thanks!</p>' }));
    const result = await submitWebform(client(fetch), 'contact', { name: 'Ana', interests: ['news'] }, { csrfToken: 'csrf', draft: true });

    expect(result).toEqual({ sid: 'uuid-1', confirmation: { type: 'inline', message: '<p>Thanks!</p>' } });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${BASE}/webform_rest/submit?_format=json`);
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/json');
    expect(calls[0]!.headers.get('X-CSRF-Token')).toBe('csrf');
    expect(calls[0]!.body).toEqual({ name: 'Ana', interests: ['news'], webform_id: 'contact', draft: true });
  });

  it('turns validation errors into per-field messages', async () => {
    const { fetch } = mockFetch(plain({ message: 'Submitted Data contains validation errors.', error: { name: 'Tell us your name.', 'address][city': 'City is required.' } }, 400));
    const error = await submitWebform(client(fetch), 'contact', {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WebformValidationError);
    const validation = error as WebformValidationError;
    expect(validation.message).toBe('Submitted Data contains validation errors.');
    expect(validation.errorFor('name')).toBe('Tell us your name.');
    expect(validation.errorFor('address')).toBe('City is required.');
    expect(validation.errorFor('email')).toBeNull();
  });

  it('reports a closed form or missing access', async () => {
    const { fetch } = mockFetch(plain({ error: { message: 'Permission denied.' } }, 400));
    await expect(submitWebform(client(fetch), 'contact', {})).rejects.toEqual(new WebformError('Permission denied.', 400));
    await expect(submitWebform(client(fetch), 'contact', {})).rejects.toBeInstanceOf(WebformError);
  });

  it('reads and updates a submission', async () => {
    const { fetch, calls } = mockFetch(
      plain({ entity: { sid: [{ value: 7 }], uuid: [{ value: 'uuid-1' }], webform_id: [{ target_id: 'contact' }], in_draft: [{ value: false }], notes: [] }, data: { name: 'Ana' } }),
      plain({ sid: 'uuid-1' }),
    );
    const submission = await getSubmission(client(fetch), 'contact', 'uuid-1');
    expect(submission).toEqual({ entity: { sid: 7, uuid: 'uuid-1', webform_id: 'contact', in_draft: false, notes: null }, data: { name: 'Ana' } });
    expect(await updateSubmission(client(fetch), 'contact', 'uuid-1', { name: 'Ana H.' })).toEqual({ sid: 'uuid-1' });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${BASE}/webform_rest/contact/submission/uuid-1?_format=json`,
      `PATCH ${BASE}/webform_rest/contact/submission/uuid-1?_format=json`,
    ]);
    expect(calls[1]!.body).toEqual({ name: 'Ana H.' });
  });
});
