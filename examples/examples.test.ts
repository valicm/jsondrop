import { JsonApiClient } from '@jsondrop/core';
import { describe, expect, it } from 'vitest';
import { json, mockFetch, type RecordedCall } from '../packages/core/test/mock-fetch.js';
import { checkout, ShopApi } from './05-commerce-subclass.js';

const price = (number: string) => ({ number, currency_code: 'EUR', formatted: `${number} €` });

function order(meta: Record<string, unknown>) {
  return {
    data: {
      type: 'order--default',
      id: 'o1',
      attributes: { state: 'draft', order_total: { subtotal: price('10'), adjustments: [], total: price('10') } },
      relationships: { order_items: { data: [] }, store_id: { data: null } },
      meta,
    },
  };
}

/** A fake commerce_api answering by method and path. */
function commerceApi(payment: { status: number; body: unknown }) {
  return mockFetch((call: RecordedCall) => {
    const path = `${call.method} ${new URL(call.url).pathname.replace('/jsonapi', '')}`;
    switch (path) {
      case 'GET /carts':
        return json({ data: [order({}).data] })(call);
      case 'GET /checkout/o1/shipping-methods':
        return json({ data: [{ type: 'shipping-rate-option', id: '2--default', attributes: { shipping_method_id: '2', service: { id: 'default', label: 'Flat' } } }] })(call);
      case 'PATCH /checkout/o1':
        return json(order({}))(call);
      case 'GET /checkout/o1':
        return json(order({ payment_options: [{ id: 'card', label: 'Card', payment_gateway_id: 'card', payment_method_id: null, payment_method_type_id: null }] }))(call);
      case 'POST /checkout/o1/payment':
        return json(payment.body, payment.status)(call);
      default:
        return json({ errors: [{ detail: `Unexpected ${path}` }] }, 404)(call);
    }
  });
}

describe('example 5: ShopApi', () => {
  const shopFor = (fetch: typeof globalThis.fetch) =>
    new ShopApi(new JsonApiClient({ baseUrl: 'https://shop.example.com', fetch }), { market: { country: 'HR', currency: 'EUR' } }).withCartToken('tok');

  it('runs a checkout to a placed order, with market and cart token headers', async () => {
    const { fetch, calls } = commerceApi({ status: 201, body: { data: { type: 'payment--payment-default', id: 'p1', attributes: { state: 'completed', amount: price('10') } } } });
    const result = await checkout(shopFor(fetch), 'ana@example.com');

    expect(result).toMatchObject({ status: 'placed', payment: { id: 'p1' } });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'GET /jsonapi/carts',
      'PATCH /jsonapi/checkout/o1',
      'GET /jsonapi/checkout/o1/shipping-methods',
      'PATCH /jsonapi/checkout/o1',
      'GET /jsonapi/checkout/o1',
      'PATCH /jsonapi/checkout/o1',
      'GET /jsonapi/checkout/o1',
      'POST /jsonapi/checkout/o1/payment',
    ]);
    for (const call of calls) {
      expect(call.headers.get('Commerce-Cart-Token')).toBe('tok');
      expect(call.headers.get('X-Currency')).toBe('EUR');
    }
  });

  it('surfaces a 3-D Secure step', async () => {
    const { fetch } = commerceApi({ status: 202, body: { data: null, meta: { action: { type: 'threeDS2', token: 'x' } } } });
    expect(await checkout(shopFor(fetch), 'ana@example.com')).toEqual({ status: 'action', action: { type: 'threeDS2', token: 'x' } });
  });

  it('adds its default field to every add-to-cart', async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    await shopFor(fetch).addToCart({ type: 'product-variation--clothing', id: 'v1' });
    expect(calls[0]!.body).toEqual({ data: [{ type: 'product-variation--clothing', id: 'v1', meta: { field_source: 'web' } }] });
  });
});
